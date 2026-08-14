// Spieltags-Ticker: Was machen meine Mannschaften heute?
//
//   node scripts/live.mjs
//
// Läuft an Spieltagen häufig und schreibt data/live.json. Grundlage sind die
// Mannschaften aus data/tabellen.json; für jede wird geschaut, ob heute ein
// Spiel ansteht, und wenn ja der Spielverlauf geholt.
//
// EHRLICHE EINORDNUNG: Das ist kein Ticker in Echtzeit. GitHub Actions kann
// frühestens alle fünf Minuten anstoßen und verzögert unter Last regelmäßig um
// weitere zehn bis zwanzig. Rechne mit einem Rückstand von etwa einer
// Viertelstunde. Für einen Amateurspieltag reicht das; wer die Minute braucht,
// ist bei fussball.de selbst besser aufgehoben – dorthin wird verlinkt.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { spielverlauf } from './lib/spielverlauf.mjs';
import { spiele } from './lib/fussballde.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATEN = join(HERE, '..', 'data');
const ZIEL = join(DATEN, 'live.json');
const QUELLE = join(DATEN, 'tabellen.json');

const PAUSE_MS = 500;
const log = (...a) => console.log(...a);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(QUELLE)) {
  log('data/tabellen.json fehlt – erst scripts/tabellen.mjs laufen lassen.');
  process.exit(0);
}
const tabellen = JSON.parse(readFileSync(QUELLE, 'utf8'));

// ── Heutiges Datum in deutscher Schreibweise, wie fussball.de es ausgibt ─────
const heute = new Date();
const zweistellig = (n) => String(n).padStart(2, '0');
const heuteKurz = `${zweistellig(heute.getDate())}.${zweistellig(heute.getMonth() + 1)}.`;

/** „Sonntag, 16.08.2026 - 15:00 Uhr“ → { tag: '16.08.', zeit: '15:00' } */
function terminLesen(roh) {
  const m = String(roh).match(/(\d{2}\.\d{2}\.)(\d{4})?\s*-\s*(\d{2}:\d{2})/);
  return m ? { tag: m[1], jahr: m[2], zeit: m[3] } : null;
}

// ── Heutige Partien der eigenen Mannschaften finden ─────────────────────────
// Nur Fußball: die Handballdaten enthalten keine Spielpläne, und der
// Spielverlauf ist ein Sonderweg von fussball.de.
const fussball = tabellen.mannschaften.filter((m) => (m.sportart ?? 'Fußball') === 'Fußball' && m.teamId);
log(`${fussball.length} Fußballmannschaften werden auf heutige Spiele geprüft (${heuteKurz})`);

const heutige = [];
for (const m of fussball) {
  // Erst im vorhandenen Spielplan nachsehen, das spart Abrufe.
  let kandidaten = (m.naechste ?? []).concat(m.letzte ?? [])
    .filter((s) => terminLesen(s.datum)?.tag === heuteKurz);

  // Nichts gefunden? Dann den Plan frisch holen – er könnte veraltet sein.
  if (kandidaten.length === 0) {
    try {
      const frisch = await spiele(m.teamId, 'next');
      kandidaten = frisch.filter((s) => terminLesen(s.datum)?.tag === heuteKurz);
      await warte(PAUSE_MS);
    } catch { /* Mannschaft überspringen */ }
  }

  for (const s of kandidaten) {
    if (!s.url) continue;
    if (heutige.some((h) => h.url === s.url)) continue;   // beide Mannschaften im selben Spiel
    heutige.push({ ...s, verein: m.verein, ort: m.ort, zone: m.zone, liga: m.liga });
  }
}

log(`${heutige.length} Partien heute`);

// ── Verlauf holen ───────────────────────────────────────────────────────────
const partien = [];
for (const s of heutige) {
  const termin = terminLesen(s.datum);
  const verlauf = await spielverlauf(s.url);
  await warte(PAUSE_MS);

  // Anpfiff als Zeitstempel, damit die App die laufende Minute schätzen kann.
  let anpfiff = null;
  let seitAnpfiffMin = null;
  if (termin?.zeit) {
    const [std, min] = termin.zeit.split(':').map(Number);
    const d = new Date(heute);
    d.setHours(std, min, 0, 0);
    anpfiff = d.toISOString();
    seitAnpfiffMin = Math.round((Date.now() - d.getTime()) / 60000);
  }

  // Zwei Stunden nach Anpfiff ist auch die zäheste Kreisligapartie vorbei –
  // inklusive Halbzeitpause und Nachspielzeit.
  const abgeschlossen = seitAnpfiffMin != null && seitAnpfiffMin > 120;
  const laeuft = seitAnpfiffMin != null && seitAnpfiffMin >= 0 && seitAnpfiffMin <= 120;

  partien.push({
    url: s.url,
    verein: s.verein,
    ort: s.ort,
    zone: s.zone,
    liga: s.liga,
    wettbewerb: s.wettbewerb,
    anpfiff,
    zeit: termin?.zeit ?? null,
    hinweis: s.hinweis || null,
    heim: verlauf?.heim || s.heim,
    gast: verlauf?.gast || s.gast,
    tore: verlauf?.tore ?? null,
    ereignisse: verlauf?.ereignisse ?? [],
    abgeschlossen,
    laeuft,
    seitAnpfiffMin,
  });

  const stand = verlauf?.tore ? `${verlauf.tore.heim}:${verlauf.tore.gast}` : '—';
  log(`  ${(s.heim + ' – ' + s.gast).padEnd(52)} ${stand}  ${verlauf?.ereignisse.length ?? 0} Ereignisse`);
}

partien.sort((a, b) => String(a.zeit).localeCompare(String(b.zeit)));

mkdirSync(DATEN, { recursive: true });
writeFileSync(ZIEL, JSON.stringify({
  aktualisiert: new Date().toISOString(),
  tag: heuteKurz,
  hinweisVerzoegerung: 'Der Stand wird alle zehn Minuten geholt und kann entsprechend '
    + 'nachhinken. Für die Minute bitte dem Link zu fussball.de folgen.',
  hinweisTorschuetzen: 'fussball.de gibt die Namen der Torschützen nur über eine wechselnde '
    + 'Spezialschrift aus. Diese Sperre wird nicht umgangen, deshalb stehen hier Minute und '
    + 'Ereignisart, aber keine Namen.',
  partien,
}, null, 1) + '\n', 'utf8');

log(`\ngeschrieben: ${ZIEL}  (${partien.length} Partien)`);
