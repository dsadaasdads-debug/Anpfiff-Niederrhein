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

log(`  ${zurAnreicherung.length} Sportkandidaten  (verworfen: ${verworfen.keinSport} kein Sport, ${verworfen.keinOrt} kein Ortsbezug)`);

// ── Neue Artikel anreichern ─────────────────────────────────────────────────
const neu = zurAnreicherung.filter((k) => !speicher.has(k.id));
log(`\n${neu.length} Artikelseiten werden geladen (Vorschautext, Bild, Paywall), ${zurAnreicherung.length - neu.length} aus dem Zwischenspeicher`);

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

  const teaser = details?.teaser || alt?.teaser || '';
  const bild = details?.bild || alt?.bild || k.eintrag.bild || '';
  const paywall = details ? details.paywall : (alt?.paywall ?? null);

  // Mit dem Vorschautext liegt mehr Text vor als beim ersten Durchgang –
  // Vereine und Orte deshalb noch einmal bestimmen.
  const volltext = `${k.eintrag.titel} ${teaser}`;
  const vereine = vereineFinden(volltext);
  const bezug = ortsbezug({ titel: k.eintrag.titel, teaser, url: k.eintrag.link, vereine });

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
