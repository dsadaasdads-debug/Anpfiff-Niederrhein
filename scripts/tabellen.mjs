// Holt Tabellen, Platzierungen und Spielpläne von fussball.de und schreibt
// data/tabellen.json.
//
//   node scripts/tabellen.mjs
//
// Läuft getrennt vom Meldungssammler und seltener: Tabellen ändern sich nur am
// Wochenende. Die Zuordnung Verein → Mannschaft → Staffel wird zwischengespeichert
// und nur einmal pro Woche erneuert, denn sie wechselt bloß zum Saisonstart.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { VEREINE } from './clubs.mjs';
import { mannschaften, ersteHerren, mannschaftsprofil, tabelle, spiele } from './lib/fussballde.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATEN = join(HERE, '..', 'data');
const ZIEL = join(DATEN, 'tabellen.json');
const SPEICHER = join(DATEN, 'tabellen-cache.json');

// Nur die Kernstädte plus ausdrücklich gewünschte Vereine. Alle 59 Vereine
// abzufragen wäre unhöflich gegenüber fussball.de und für den Zweck unnötig.
const ZONEN = new Set(['kern']);
const IMMER_DABEI = new Set(['1. FC Lintfort', 'SV Budberg 1946', 'TUS Xanten 05/22']);

const ZUORDNUNG_HAELT_TAGE = 7;
const PAUSE_MS = 700;

const log = (...a) => console.log(...a);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const ziel = VEREINE.filter((v) => v.fussballDeId && (ZONEN.has(v.zone) || IMMER_DABEI.has(v.name)));
log(`${ziel.length} Vereine werden abgefragt\n`);

// ── Zwischenspeicher der Zuordnung ──────────────────────────────────────────
let zuordnung = {};
if (existsSync(SPEICHER)) {
  try { zuordnung = JSON.parse(readFileSync(SPEICHER, 'utf8')); } catch { zuordnung = {}; }
}

const veraltet = (eintrag) => !eintrag?.geprueft
  || Date.now() - Date.parse(eintrag.geprueft) > ZUORDNUNG_HAELT_TAGE * 86_400_000;

// ── Sammeln ─────────────────────────────────────────────────────────────────
const mannschaftsliste = [];
const staffeln = new Map();
const fehler = [];

for (const verein of ziel) {
  try {
    let eintrag = zuordnung[verein.name];

    if (veraltet(eintrag)) {
      const alle = await mannschaften(verein.slug, verein.fussballDeId);
      const herren = ersteHerren(alle);
      if (!herren) { log(`—  ${verein.name.padEnd(32)} keine Herrenmannschaft gefunden`); continue; }
      eintrag = { teamId: herren.teamId, teamUrl: herren.url, mannschaft: herren.name, geprueft: new Date().toISOString() };
      zuordnung[verein.name] = eintrag;
      await warte(PAUSE_MS);
    }

    const profil = await mannschaftsprofil(eintrag.teamUrl);
    await warte(PAUSE_MS);

    if (profil.staffelId && !staffeln.has(profil.staffelId)) {
      staffeln.set(profil.staffelId, { name: profil.liga, zeilen: await tabelle(profil.staffelId) });
      await warte(PAUSE_MS);
    }

    const naechste = await spiele(eintrag.teamId, 'next');
    await warte(PAUSE_MS);
    const letzte = await spiele(eintrag.teamId, 'prev');
    await warte(PAUSE_MS);

    mannschaftsliste.push({
      verein: verein.name,
      ort: verein.ort,
      zone: verein.zone,
      mannschaft: eintrag.mannschaft,
      teamId: eintrag.teamId,
      teamUrl: eintrag.teamUrl,
      liga: profil.liga,
      spielklasse: profil.spielklasse,
      platz: profil.platz,
      punkte: profil.punkte,
      torverhaeltnis: profil.torverhaeltnis,
      staffelId: profil.staffelId,
      naechste: naechste.slice(0, 5),
      letzte: letzte.slice(0, 5),
    });

    const tab = staffeln.get(profil.staffelId);
    log(`✔  ${verein.name.padEnd(32)} ${String(profil.liga ?? '—').padEnd(24)} Platz ${profil.platz ?? '—'}, ${naechste.length} Spiele, Tabelle ${tab ? tab.zeilen.length : 0} Zeilen`);
  } catch (err) {
    fehler.push({ verein: verein.name, fehler: err.message });
    log(`✗  ${verein.name.padEnd(32)} ${err.message.slice(0, 60)}`);
  }
}

// ── Schreiben ───────────────────────────────────────────────────────────────
mkdirSync(DATEN, { recursive: true });

mannschaftsliste.sort((a, b) => a.verein.localeCompare(b.verein, 'de'));

writeFileSync(ZIEL, JSON.stringify({
  aktualisiert: new Date().toISOString(),
  // Damit die App erklären kann, warum keine Ergebnisse dastehen.
  hinweisErgebnisse: 'fussball.de gibt die Ziffern gespielter Ergebnisse nur über eine '
    + 'wechselnde Spezialschrift aus. Diese Sperre wird nicht umgangen – für das Ergebnis '
    + 'führt der Link zur Spielseite.',
  staffeln: Object.fromEntries(staffeln),
  mannschaften: mannschaftsliste,
  fehler,
}, null, 1) + '\n', 'utf8');

writeFileSync(SPEICHER, JSON.stringify(zuordnung, null, 1) + '\n', 'utf8');

log(`\n${'─'.repeat(60)}`);
log(`geschrieben: ${ZIEL}`);
log(`  Mannschaften   ${mannschaftsliste.length}`);
log(`  Staffeln       ${staffeln.size}`);
log(`  mit Tabelle    ${mannschaftsliste.filter((m) => staffeln.get(m.staffelId)?.zeilen.length).length}`);
log(`  Fehler         ${fehler.length}`);
