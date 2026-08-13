// Sammelt die lokalen Sportmeldungen ein und schreibt data/feed.json.
//
//   node scripts/fetch.mjs
//
// Ablauf: Feeds holen → entdoppeln → Sport erkennen → Ortsbezug bestimmen →
// neue Artikel einmalig anreichern (Vorschautext, Bild, Paywall) → gewichten →
// mit dem Bestand vereinen → auf 30 Tage kürzen.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SOURCES } from './sources.mjs';
import { VEREINE, ZONEN } from './clubs.mjs';
import { parseRss } from './lib/rss.mjs';
import { artikelDetails, feedLaden, nacheinander } from './lib/artikel.mjs';
import { urlSchluessel, vereineFinden, ortsbezug, istSport, bewerten, sportartErkennen } from './lib/einstufung.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HERE, '..');
const DATEN = join(WURZEL, 'data');
const ZIEL = join(DATEN, 'feed.json');
const SPEICHER = join(DATEN, 'artikel-cache.json');

const BEHALTEN_TAGE = 30;
// Etwas länger als das Archiv, damit ein Artikel am Rand nicht doch noch
// einmal geholt wird, kurz bevor er ohnehin herausfällt.
const SPEICHER_TAGE = 35;
const GLEICHZEITIG_FEEDS = 5;
const GLEICHZEITIG_ARTIKEL = 4;

const log = (...a) => console.log(...a);

// ── Bestand laden ───────────────────────────────────────────────────────────
const bestand = new Map();
if (existsSync(ZIEL)) {
  try {
    const alt = JSON.parse(readFileSync(ZIEL, 'utf8'));
    for (const a of alt.artikel ?? []) bestand.set(a.id, a);
    log(`Bestand: ${bestand.size} Artikel`);
  } catch (err) {
    log(`Bestand nicht lesbar (${err.message}) – beginne neu.`);
  }
}

// Zwischenspeicher aller je abgerufenen Artikelseiten – auch der später
// verworfenen. Ohne ihn würde jeder Lauf dieselben Seiten erneut holen, nur
// um sie wieder auszusortieren. Liegt getrennt von feed.json, damit die App
// ihn nicht mitladen muss.
const speicher = new Map();
if (existsSync(SPEICHER)) {
  try {
    for (const [id, wert] of Object.entries(JSON.parse(readFileSync(SPEICHER, 'utf8')))) {
      speicher.set(id, wert);
    }
    log(`Zwischenspeicher: ${speicher.size} Artikelseiten`);
  } catch (err) {
    log(`Zwischenspeicher nicht lesbar (${err.message}) – beginne neu.`);
  }
}

// ── Feeds holen ─────────────────────────────────────────────────────────────
const quellenStatus = [];

const feedErgebnisse = await nacheinander(SOURCES, GLEICHZEITIG_FEEDS, async (quelle) => {
  try {
    const xml = await feedLaden(quelle.url);
    const eintraege = parseRss(xml);
    quellenStatus.push({ id: quelle.id, name: quelle.name, status: 'ok', eintraege: eintraege.length });
    log(`  ${quelle.id.padEnd(20)} ${String(eintraege.length).padStart(3)} Einträge`);
    return { quelle, eintraege };
  } catch (err) {
    quellenStatus.push({ id: quelle.id, name: quelle.name, status: 'fehler', fehler: err.message, eintraege: 0 });
    log(`  ${quelle.id.padEnd(20)} FEHLER ${err.message}`);
    return { quelle, eintraege: [] };
  }
});

// ── Entdoppeln ──────────────────────────────────────────────────────────────
// Die RP-Stadtfeeds überschneiden sich stark; derselbe Artikel steht oft in
// drei Feeds. Wir behalten den ersten Fund und merken uns die weiteren Quellen.
const kandidaten = new Map();
for (const { quelle, eintraege } of feedErgebnisse) {
  for (const eintrag of eintraege) {
    const id = urlSchluessel(eintrag.link);
    const vorhanden = kandidaten.get(id);
    if (vorhanden) {
      if (!vorhanden.auchIn.includes(quelle.name)) vorhanden.auchIn.push(quelle.name);
      continue;
    }
    kandidaten.set(id, { id, eintrag, quelle, auchIn: [] });
  }
}
log(`\n${kandidaten.size} verschiedene Artikel nach Entdoppelung`);

// ── Sport erkennen und vorsortieren ─────────────────────────────────────────
const zurAnreicherung = [];
const verworfen = { keinSport: 0, keinOrt: 0 };

for (const k of kandidaten.values()) {
  const text = `${k.eintrag.titel} ${k.eintrag.beschreibung}`;
  const vereine = vereineFinden(text);
  const { sport, grund } = istSport({ eintrag: k.eintrag, quelle: k.quelle, vereine });

  if (!sport) { verworfen.keinSport++; continue; }

  const bezug = ortsbezug({ titel: k.eintrag.titel, teaser: k.eintrag.beschreibung, url: k.eintrag.link, vereine });

  // Überregionale Sportfeeds (NRZ, WAZ) müssen ihren Ortsbezug schon aus
  // Titel und Feed-Text belegen – sonst fluten Schalke, BVB und RWE den Feed.
  // Bei Stadtfeeds reicht der spätere Beleg aus dem Artikeltext.
  if (!bezug.zone && k.quelle.mode === 'sport') { verworfen.keinOrt++; continue; }

  zurAnreicherung.push({ ...k, vereine, grund, bezug });
}

/**
 * Vereinsfeeds tragen ihren Ort im Absender, nicht im Text: „Unsere Erste
 * gewinnt 3:1“ nennt weder Stadt noch Vereinsnamen. Ohne diesen Rückgriff
 * fiele fast jeder Beitrag der Vereinsseiten durch den Ortsfilter.
 */
function bezugMitQuelle(bezug, quelle) {
  if (quelle.mode !== 'club') return bezug;
  if (bezug.zone) return bezug;
  return {
    orte: quelle.ort ? [quelle.ort] : [],
    zone: quelle.zone ?? null,
    haupt: quelle.ort ?? null,
    sicher: true,
  };
}

log(`  ${zurAnreicherung.length} Sportkandidaten  (verworfen: ${verworfen.keinSport} kein Sport, ${verworfen.keinOrt} kein Ortsbezug)`);

// ── Neue Artikel anreichern ─────────────────────────────────────────────────
// Nicht jede Quelle braucht einen Abruf der Artikelseite:
//   Vereinsseiten liefern echten Vorschautext und sind nie kostenpflichtig.
//   Funke-Feeds liefern Vorschautext, Bild und den Bezahlstatus gleich mit.
// Übrig bleibt im Wesentlichen RP Online, das im Feed nur "Sy Sy" ausgibt.
const brauchtAbruf = (k) => {
  if (k.eintrag.beschreibung.length <= 40) return true;
  if (k.quelle.mode === 'club') return false;
  if (k.eintrag.zugang) return false;
  return true;
};

const neu = zurAnreicherung.filter((k) => brauchtAbruf(k) && !speicher.has(k.id));
const ausSpeicher = zurAnreicherung.filter((k) => brauchtAbruf(k) && speicher.has(k.id)).length;
const ohneAbruf = zurAnreicherung.filter((k) => !brauchtAbruf(k)).length;
log(`\n${neu.length} Artikelseiten werden geladen, ${ausSpeicher} aus dem Zwischenspeicher, ${ohneAbruf} brauchen keinen Abruf (Vereinsfeeds)`);

let fehlgeschlagen = 0;
await nacheinander(neu, GLEICHZEITIG_ARTIKEL, async (k) => {
  const details = await artikelDetails(k.eintrag.link);
  if (details.fehler) {
    fehlgeschlagen++;
    log(`  ! ${details.fehler}  ${k.eintrag.link}`);
    // Fehlversuche werden nicht gemerkt – beim nächsten Lauf neu probieren.
    return;
  }
  speicher.set(k.id, {
    teaser: details.teaser,
    bild: details.bild,
    paywall: details.paywall,
    geholt: new Date().toISOString(),
  });
});
log(`  ${neu.length - fehlgeschlagen} geladen, ${fehlgeschlagen} fehlgeschlagen`);

// ── Zusammenbauen ───────────────────────────────────────────────────────────
const jetzt = Date.now();
const grenze = jetzt - BEHALTEN_TAGE * 86_400_000;
const ergebnis = new Map();

for (const k of zurAnreicherung) {
  const alt = bestand.get(k.id);
  const details = speicher.get(k.id);

  const teaser = details?.teaser || alt?.teaser || k.eintrag.beschreibung || '';
  const bild = details?.bild || alt?.bild || k.eintrag.bild || '';
  const paywall = k.quelle.mode === 'club'
    ? false                                   // Vereinsseiten sind immer frei
    : k.eintrag.zugang                        // Funke sagt es im Feed
      ? k.eintrag.zugang === 'paid'
      : (details ? details.paywall : (alt?.paywall ?? null));

  // Mit dem Vorschautext liegt mehr Text vor als beim ersten Durchgang –
  // Vereine und Orte deshalb noch einmal bestimmen.
  const volltext = `${k.eintrag.titel} ${teaser}`;
  const vereine = vereineFinden(volltext);
  // Der absendende Verein gehört dazu, auch wenn er sich im Text nicht nennt.
  if (k.quelle.club && !vereine.some((v) => v.name === k.quelle.club)) {
    const eigen = VEREINE.find((v) => v.name === k.quelle.club);
    if (eigen) vereine.unshift(eigen);
  }
  const bezug = bezugMitQuelle(
    ortsbezug({ titel: k.eintrag.titel, teaser, url: k.eintrag.link, vereine }),
    k.quelle,
  );

  if (!bezug.zone) { verworfen.keinOrt++; continue; }

  const datum = k.eintrag.datum ?? (alt?.datum ? new Date(alt.datum) : null);
  if (datum && datum.getTime() < grenze) continue;

  const { punkte, sortZeit } = bewerten({ zone: bezug.zone, vereine, grund: k.grund, datum });

  ergebnis.set(k.id, {
    id: k.id,
    titel: k.eintrag.titel,
    url: k.eintrag.link,
    teaser,
    bild,
    datum: datum ? datum.toISOString() : null,
    sortZeit,
    punkte,
    paywall,
    quelle: k.quelle.publisher,
    quelleName: k.quelle.name,
    auchIn: k.auchIn,
    ort: bezug.haupt,
    ortSicher: bezug.sicher,
    orte: bezug.orte,
    zone: bezug.zone,
    vereine: vereine.map((v) => v.name),
    sportart: sportartErkennen(volltext, vereine),
    grund: k.grund,
  });
}

// Bestandsartikel, die aktuell in keinem Feed mehr stehen, bleiben im Archiv.
for (const [id, alt] of bestand) {
  if (ergebnis.has(id)) continue;
  const zeit = alt.datum ? Date.parse(alt.datum) : 0;
  if (zeit >= grenze) ergebnis.set(id, alt);
}

const artikel = [...ergebnis.values()].sort((a, b) => b.sortZeit - a.sortZeit);

// ── Schreiben ───────────────────────────────────────────────────────────────
mkdirSync(DATEN, { recursive: true });

const ausgabe = {
  aktualisiert: new Date().toISOString(),
  behaltenTage: BEHALTEN_TAGE,
  zonen: ZONEN,
  quellen: quellenStatus.sort((a, b) => a.id.localeCompare(b.id)),
  vereine: VEREINE.map((v) => ({ name: v.name, ort: v.ort, zone: v.zone, sportart: v.sportart })),
  artikel,
};

writeFileSync(ZIEL, JSON.stringify(ausgabe, null, 1) + '\n', 'utf8');

// Zwischenspeicher aufräumen und sichern.
const speicherGrenze = jetzt - SPEICHER_TAGE * 86_400_000;
const gekuerzt = Object.fromEntries(
  [...speicher.entries()].filter(([, wert]) => (Date.parse(wert.geholt) || 0) >= speicherGrenze),
);
writeFileSync(SPEICHER, JSON.stringify(gekuerzt) + '\n', 'utf8');

// ── Bilanz ──────────────────────────────────────────────────────────────────
const zaehle = (fn) => artikel.filter(fn).length;
log(`\n${'─'.repeat(60)}`);
log(`geschrieben: ${ZIEL}`);
log(`  Artikel gesamt          ${artikel.length}`);
log(`  davon Kernstädte        ${zaehle((a) => a.zone === 'kern')}`);
log(`  davon Umland            ${zaehle((a) => a.zone === 'umland')}`);
log(`  davon Duisburg          ${zaehle((a) => a.zone === 'duisburg')}`);
log(`  hinter Paywall          ${zaehle((a) => a.paywall === true)}`);
log(`  frei lesbar             ${zaehle((a) => a.paywall === false)}`);
log(`  Zugang unbekannt        ${zaehle((a) => a.paywall === null)}`);
log(`  mit erkanntem Verein    ${zaehle((a) => a.vereine.length > 0)}`);

log(`\nBeitrag je Quelle:`);
const jeQuelle = new Map();
for (const a of artikel) jeQuelle.set(a.quelleName, (jeQuelle.get(a.quelleName) ?? 0) + 1);
for (const q of quellenStatus) {
  const n = jeQuelle.get(q.name) ?? 0;
  // Vereinsfeeds liefern oft nichts, weil ihr letzter Beitrag älter als das
  // Archivfenster ist. Das ist kein Fehler – sie füllen sich mit der Zeit.
  log(`  ${q.name.padEnd(38)} ${String(n).padStart(3)} von ${String(q.eintraege).padStart(3)}`);
}
