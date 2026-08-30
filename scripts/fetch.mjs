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
import { urlSchluessel, vereineFinden, ortsbezug, istSport, istVereinsintern, bewerten, sportartErkennen, ereignisErkennen } from './lib/einstufung.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HERE, '..');
const DATEN = join(WURZEL, 'data');
const ZIEL = join(DATEN, 'feed.json');
const ARCHIV = join(DATEN, 'feed-archiv.json');
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
for (const datei of [ZIEL, ARCHIV]) {
  if (!existsSync(datei)) continue;
  try {
    const alt = JSON.parse(readFileSync(datei, 'utf8'));
    for (const a of alt.artikel ?? []) bestand.set(a.id, a);
  } catch (err) {
    log(`${datei} nicht lesbar (${err.message}) – wird neu aufgebaut.`);
  }
}
log(`Bestand: ${bestand.size} Artikel`);

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

// Wann war eine Quelle zuletzt erreichbar? Ohne diesen Vermerk verschwindet
// ein Ausfall beim nächsten geglückten Lauf spurlos, und man sieht nie, ob
// eine Quelle dauerhaft klemmt oder nur einmal gehustet hat.
const quellenLage = speicher.get('__quellen') ?? {};

const feedErgebnisse = await nacheinander(SOURCES, GLEICHZEITIG_FEEDS, async (quelle) => {
  const lage = quellenLage[quelle.id] ?? {};
  try {
    const xml = await feedLaden(quelle.url);
    const eintraege = parseRss(xml);
    quellenLage[quelle.id] = { letzterErfolg: new Date().toISOString(), ausfaelle: 0 };
    quellenStatus.push({ id: quelle.id, name: quelle.name, status: 'ok', eintraege: eintraege.length });
    log(`  ${quelle.id.padEnd(22)} ${String(eintraege.length).padStart(3)} Einträge`);
    return { quelle, eintraege };
  } catch (err) {
    quellenLage[quelle.id] = {
      letzterErfolg: lage.letzterErfolg ?? null,
      ausfaelle: (lage.ausfaelle ?? 0) + 1,
      letzterFehler: err.message,
    };
    quellenStatus.push({
      id: quelle.id,
      name: quelle.name,
      status: 'fehler',
      fehler: err.message,
      eintraege: 0,
      letzterErfolg: lage.letzterErfolg ?? null,
      ausfaelleInFolge: quellenLage[quelle.id].ausfaelle,
    });
    log(`  ${quelle.id.padEnd(22)} FEHLER ${err.message}  (${quellenLage[quelle.id].ausfaelle}. Mal in Folge)`);
    return { quelle, eintraege: [] };
  }
});

speicher.set('__quellen', quellenLage);

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

  const { sortZeit } = bewerten({ zone: bezug.zone, vereine, grund: k.grund, datum });
  const sportart = sportartErkennen(volltext, vereine);
  const ereignis = ereignisErkennen(k.eintrag.titel, sportart);

  ergebnis.set(k.id, {
    id: k.id,
    titel: k.eintrag.titel,
    url: k.eintrag.link,
    // Deckeln: die Karte zeigt zwei Zeilen, alles darüber ist Ballast. Der
    // längste Vorschautext im Bestand hatte 499 Zeichen.
    teaser: teaser.length > 220 ? `${teaser.slice(0, 217).trimEnd()}…` : teaser,
    bild,
    datum: datum ? datum.toISOString() : null,
    sortZeit,
    paywall,
    quelle: k.quelle.publisher,
    ort: bezug.haupt,
    ortSicher: bezug.sicher,
    orte: bezug.orte,
    zone: bezug.zone,
    vereine: vereine.map((v) => v.name),
    sportart,
    ereignis,
  });
}

// Bestandsartikel, die aktuell in keinem Feed mehr stehen, bleiben im Archiv –
// werden dabei aber neu bewertet. Sonst wirkt jede Regelkorrektur nur auf frische
// Meldungen, und alte Fehltreffer bleiben dreißig Tage lang stehen: der Bericht
// über Borussia Dortmund trug so noch Tage später die Ortsmarke „Sonsbeck“.
// Gespeichert wird der Herausgeber, nicht die Quelle selbst. Für die
// rückwirkende Prüfung muss daher zurückgerechnet werden, welche Herausgeber
// Vereinsfeeds sind.
const VEREINSHERAUSGEBER = new Set(
  SOURCES.filter((q) => q.mode === 'club').map((q) => q.publisher).filter(Boolean),
);

let nachbewertet = 0;
let nachtraeglichVerworfen = 0;
for (const [id, alt] of bestand) {
  if (ergebnis.has(id)) continue;
  const zeit = alt.datum ? Date.parse(alt.datum) : 0;
  if (zeit < grenze) continue;

  const volltext = `${alt.titel} ${alt.teaser ?? ''}`;
  // Stammt der Artikel aus einem Vereinsfeed, gilt auch hier die Wortliste
  // gegen Verwaltungs- und Werbekram – sonst bliebe eine Dauerkartenwerbung
  // dreißig Tage stehen, obwohl die Regel längst dagegen spricht.
  if (VEREINSHERAUSGEBER.has(alt.quelle) && istVereinsintern(volltext)) {
    nachtraeglichVerworfen++;
    continue;
  }
  const vereine = vereineFinden(volltext);
  const bezug = ortsbezug({ titel: alt.titel, teaser: alt.teaser ?? '', url: alt.url, vereine });
  if (!bezug.zone) { nachtraeglichVerworfen++; continue; }

  const sportart = sportartErkennen(volltext, vereine);
  nachbewertet++;
  // Neu aufgebaut statt durchgereicht: so verschwinden auch Felder, die es
  // in älteren Ständen noch gab.
  ergebnis.set(id, {
    id: alt.id,
    titel: alt.titel,
    url: alt.url,
    teaser: alt.teaser ?? '',
    bild: alt.bild ?? '',
    datum: alt.datum,
    sortZeit: alt.sortZeit,
    paywall: alt.paywall ?? null,
    quelle: alt.quelle,
    ort: bezug.haupt,
    ortSicher: bezug.sicher,
    orte: bezug.orte,
    zone: bezug.zone,
    vereine: vereine.map((v) => v.name),
    sportart,
    ereignis: ereignisErkennen(alt.titel, sportart),
  });
}

const artikel = [...ergebnis.values()].sort((a, b) => b.sortZeit - a.sortZeit);

// ── Schreiben ───────────────────────────────────────────────────────────────
mkdirSync(DATEN, { recursive: true });

// Aufteilen: Die App startet mit den letzten Tagen und lädt das Archiv erst
// danach im Hintergrund nach. Sonst wandern bei jedem Start über 400 Artikel
// über die Leitung, obwohl fast niemand bis ans Ende scrollt.
const FRISCH_TAGE = 10;
const frischGrenze = jetzt - FRISCH_TAGE * 86_400_000;
const frisch = artikel.filter((a) => (Date.parse(a.datum) || 0) >= frischGrenze);
const archiv = artikel.filter((a) => (Date.parse(a.datum) || 0) < frischGrenze);

const kopf = {
  aktualisiert: new Date().toISOString(),
  behaltenTage: BEHALTEN_TAGE,
  frischTage: FRISCH_TAGE,
  zonen: ZONEN,
  quellen: quellenStatus.sort((a, b) => a.id.localeCompare(b.id)),
  vereine: VEREINE.map((v) => ({ name: v.name, ort: v.ort, zone: v.zone, sportart: v.sportart })),
};

// Ohne Einrückung geschrieben: die Formatierung allein machte 68 der 423 KB aus.
writeFileSync(ZIEL, JSON.stringify({ ...kopf, artikelGesamt: artikel.length, artikel: frisch }) + '\n', 'utf8');
writeFileSync(ARCHIV, JSON.stringify({ aktualisiert: kopf.aktualisiert, artikel: archiv }) + '\n', 'utf8');

// Zwischenspeicher aufräumen und sichern. Schlüssel mit doppeltem Unterstrich
// sind Verwaltungsdaten (etwa die Erreichbarkeitslage) und bleiben unabhängig
// vom Alter erhalten.
const speicherGrenze = jetzt - SPEICHER_TAGE * 86_400_000;
const gekuerzt = Object.fromEntries(
  [...speicher.entries()].filter(([schluessel, wert]) => schluessel.startsWith('__')
    || (Date.parse(wert.geholt) || 0) >= speicherGrenze),
);
writeFileSync(SPEICHER, JSON.stringify(gekuerzt) + '\n', 'utf8');

// ── Bilanz ──────────────────────────────────────────────────────────────────
const zaehle = (fn) => artikel.filter(fn).length;
log(`\n${'─'.repeat(60)}`);
log(`geschrieben: ${ZIEL}`);
log(`  Artikel gesamt          ${artikel.length}  (${frisch.length} frisch, ${archiv.length} im Archiv)`);
log(`  davon Kernstädte        ${zaehle((a) => a.zone === 'kern')}`);
log(`  davon Umland            ${zaehle((a) => a.zone === 'umland')}`);
log(`  davon Duisburg          ${zaehle((a) => a.zone === 'duisburg')}`);
log(`  hinter Paywall          ${zaehle((a) => a.paywall === true)}`);
log(`  frei lesbar             ${zaehle((a) => a.paywall === false)}`);
log(`  Zugang unbekannt        ${zaehle((a) => a.paywall === null)}`);
log(`  mit erkanntem Verein    ${zaehle((a) => a.vereine.length > 0)}`);
log(`  Bestand nachbewertet    ${nachbewertet}  (${nachtraeglichVerworfen} verworfen)`);

log(`\nBeitrag je Quelle:`);
const jeQuelle = new Map();
for (const a of artikel) jeQuelle.set(a.quelleName, (jeQuelle.get(a.quelleName) ?? 0) + 1);
for (const q of quellenStatus) {
  const n = jeQuelle.get(q.name) ?? 0;
  // Vereinsfeeds liefern oft nichts, weil ihr letzter Beitrag älter als das
  // Archivfenster ist. Das ist kein Fehler – sie füllen sich mit der Zeit.
  log(`  ${q.name.padEnd(38)} ${String(n).padStart(3)} von ${String(q.eintraege).padStart(3)}`);
}
