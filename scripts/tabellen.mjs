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
import * as handball from './lib/handballnet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATEN = join(HERE, '..', 'data');
const ZIEL = join(DATEN, 'tabellen.json');
const SPEICHER = join(DATEN, 'tabellen-cache.json');

// Kernstädte und Umland. Duisburg bleibt draußen: dessen Kreis- und
// Bezirksligen würden die Ansicht fluten, ohne dass sie hier jemand sucht.
const ZONEN = new Set(['kern', 'umland']);
const IMMER_DABEI = new Set();

const ZUORDNUNG_HAELT_TAGE = 7;
const PAUSE_MS = 700;

/**
 * Zusätzliche Mannschaften über die erste Herrenelf hinaus – namentlich
 * gewünscht, nicht automatisch ermittelt. Hier trägt man ein, wo jemand
 * persönlich dranhängt.
 */
const ZUSATZMANNSCHAFTEN = [
  // Ausdrücklicher Wunsch: der Bruder des Nutzers spielt dort.
  { verein: '1. FC Lintfort', muster: /^A-Junioren\b/i, bezeichnung: 'A-Jugend' },
];

// ── Handball ────────────────────────────────────────────────────────────────
// Die Spielklassen für unser Gebiet liegen bei Handball Nordrhein in den
// Kreisen Wesel und Rhein-Ruhr; Krefeld-Grenzland grenzt an und nimmt
// gelegentlich Mannschaften von hier auf.
const HANDBALL_ORGANISATION = 'Nordrhein';
const HANDBALL_KREISE = /^(Wesel|Rhein-Ruhr|Krefeld-Grenzland|Nordrhein)\b/;

/** Handballvereine der Region. fussball.de kennt sie naturgemäß nicht. */
const HANDBALL_VEREINE = [
  { muster: /\bTuS\s+Lintfort\b/i, name: 'TuS Lintfort', ort: 'Kamp-Lintfort', zone: 'kern' },
  { muster: /\bTV\s+Schwafheim\b/i, name: 'TV Schwafheim', ort: 'Moers', zone: 'kern' },
  { muster: /\bHSG\s+Moers\b/i, name: 'HSG Moers', ort: 'Moers', zone: 'kern' },
  { muster: /\bMoerser\s+TV\b/i, name: 'Moerser TV', ort: 'Moers', zone: 'kern' },
  { muster: /\bSV\s+Neukirchen\b/i, name: 'SV Neukirchen', ort: 'Neukirchen-Vluyn', zone: 'kern' },
  { muster: /\bTuS\s+Xanten\b/i, name: 'TuS Xanten', ort: 'Xanten', zone: 'umland' },
  { muster: /\bTV\s+Issum\b/i, name: 'TV Issum', ort: 'Issum', zone: 'umland' },
  { muster: /\bHSG\s+Alpen[/-]?Rheinberg\b/i, name: 'HSG Alpen/Rheinberg', ort: 'Rheinberg', zone: 'umland' },
  { muster: /\bTV\s+Rheinberg\b/i, name: 'TV Rheinberg', ort: 'Rheinberg', zone: 'umland' },
];

const handballVereinZu = (name) => HANDBALL_VEREINE.find((v) => v.muster.test(name)) ?? null;

/**
 * Spielplan einer Handballmannschaft, tolerant gegenüber Störungen.
 * handball.net drosselt bei zu vielen Abrufen; ein leerer Plan ist dann
 * besser als ein abgebrochener Lauf.
 */
async function handballSpielplan(teamId) {
  if (!teamId) return [];
  try {
    const plan = await handball.spielplan(teamId);
    await warte(200);
    return plan.filter((s2) => s2.tag).slice(0, 12);
  } catch {
    return [];
  }
}

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

      // Namentlich gewünschte Zusatzmannschaften gleich mit ablegen.
      eintrag.zusatz = ZUSATZMANNSCHAFTEN
        .filter((z) => z.verein === verein.name)
        .map((z) => {
          const treffer = alle.find((t) => z.muster.test(t.name));
          return treffer ? { teamId: treffer.teamId, teamUrl: treffer.url, mannschaft: treffer.name, bezeichnung: z.bezeichnung } : null;
        })
        .filter(Boolean);

      zuordnung[verein.name] = eintrag;
      await warte(PAUSE_MS);
    }

    const profil = await mannschaftsprofil(eintrag.teamUrl);
    await warte(PAUSE_MS);

    if (profil.staffelId && !staffeln.has(profil.staffelId)) {
      staffeln.set(profil.staffelId, { name: profil.liga, sportart: 'Fußball', zeilen: await tabelle(profil.staffelId) });
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
      sportart: 'Fußball',
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

    // ── Namentlich gewünschte Zusatzmannschaften ──
    for (const z of eintrag.zusatz ?? []) {
      try {
        const zProfil = await mannschaftsprofil(z.teamUrl);
        await warte(PAUSE_MS);
        if (zProfil.staffelId && !staffeln.has(zProfil.staffelId)) {
          staffeln.set(zProfil.staffelId, { name: zProfil.liga, sportart: 'Fußball', zeilen: await tabelle(zProfil.staffelId) });
          await warte(PAUSE_MS);
        }
        const zNaechste = await spiele(z.teamId, 'next');
        await warte(PAUSE_MS);

        mannschaftsliste.push({
          verein: `${verein.name} ${z.bezeichnung}`,
          heimatverein: verein.name,
          ort: verein.ort,
          zone: verein.zone,
          sportart: 'Fußball',
          mannschaft: z.mannschaft,
          teamId: z.teamId,
          teamUrl: z.teamUrl,
          liga: zProfil.liga,
          spielklasse: zProfil.spielklasse,
          platz: zProfil.platz,
          punkte: zProfil.punkte,
          torverhaeltnis: zProfil.torverhaeltnis,
          staffelId: zProfil.staffelId,
          naechste: zNaechste.slice(0, 5),
          letzte: [],
          // Jugendligen werden erst im Spätsommer über Qualifikationsrunden
          // eingeteilt. Bis dahin gibt es nur Freundschaftsspiele und keine
          // Tabelle – das soll die App sagen, statt eine leere Karte zu zeigen.
          hinweis: zProfil.liga ? null : 'Liga für diese Saison noch nicht zugeteilt — bis dahin nur Freundschaftsspiele.',
        });
        log(`   +  ${(verein.name + ' ' + z.bezeichnung).padEnd(29)} ${String(zProfil.liga ?? '—').padEnd(24)} Platz ${zProfil.platz ?? '—'}`);
      } catch (err) {
        fehler.push({ verein: `${verein.name} ${z.bezeichnung}`, fehler: err.message });
        log(`   ✗  ${verein.name} ${z.bezeichnung}: ${err.message.slice(0, 50)}`);
      }
    }
  } catch (err) {
    fehler.push({ verein: verein.name, fehler: err.message });
    log(`✗  ${verein.name.padEnd(32)} ${err.message.slice(0, 60)}`);
  }
}

// ── Handball ────────────────────────────────────────────────────────────────
// Welche Spielklassen überhaupt heimische Mannschaften enthalten, wird einmal
// pro Woche ermittelt und dann gemerkt – die Suche kostet gut 20 Abrufe.
log('\nHandball …');

try {
  let entdeckt = zuordnung.__handball;
  if (veraltet(entdeckt)) {
    log('  Spielklassen werden neu gesucht (einmal pro Woche)');
    const alle = await handball.wettbewerbe(HANDBALL_ORGANISATION);
    const saisons = alle.map(handball.saisonVon).filter(Boolean).sort();
    const neueste = saisons.at(-1);

    const kandidaten = alle.filter((w) => handball.saisonVon(w) === neueste
      && handball.istErwachsen(w)
      && HANDBALL_KREISE.test(String(w.name))
      && !/pokal|quali|freundschaft/i.test(w.name));

    log(`  Saison ${neueste}: ${kandidaten.length} Spielklassen im Erwachsenenbereich werden geprüft`);

    const gefunden = [];
    for (const w of kandidaten) {
      try {
        const zeilen = await handball.tabelle(w.id);
        if (zeilen.some((z) => handballVereinZu(z.verein))) {
          gefunden.push({ id: w.id, name: w.name.replace(/\s*\(.*\)\s*$/, '').trim() });
        }
      } catch { /* einzelne Spielklasse ohne Tabelle – überspringen */ }
      await new Promise((r) => setTimeout(r, 150));
    }
    entdeckt = { ligen: gefunden, saison: neueste, geprueft: new Date().toISOString() };
    zuordnung.__handball = entdeckt;
    log(`  ${gefunden.length} Spielklassen mit heimischen Mannschaften`);
  }

  for (const liga of entdeckt.ligen ?? []) {
    try {
      const zeilen = await handball.tabelle(liga.id);
      if (!zeilen.length) continue;
      staffeln.set(liga.id, { name: liga.name, sportart: 'Handball', zeilen });

      for (const z of zeilen) {
        const verein = handballVereinZu(z.verein);
        if (!verein) continue;
        mannschaftsliste.push({
          verein: z.verein,          // wie in der Tabelle geschrieben
          heimatverein: verein.name, // vereinheitlichter Name
          ort: verein.ort,
          zone: verein.zone,
          sportart: 'Handball',
          mannschaft: z.verein,
          teamId: z.teamId,
          teamUrl: `https://www.handball.net/mannschaften/${z.teamId}/tabelle`,
          liga: liga.name,
          spielklasse: liga.name.split(' - ').at(-1) ?? liga.name,
          platz: z.platz,
          punkte: z.punkte,
          torverhaeltnis: z.tore,
          staffelId: liga.id,
          // Spielplan gleich mitnehmen: der Spieltags-Ticker liest ihn von
          // hier, statt handball.net alle zwei Minuten selbst zu fragen.
          naechste: await handballSpielplan(z.teamId),
          letzte: [],
        });
      }
      log(`✔  ${liga.name.padEnd(46)} ${zeilen.length} Mannschaften`);
      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      fehler.push({ verein: liga.name, fehler: err.message });
      log(`✗  ${liga.name.padEnd(46)} ${err.message.slice(0, 50)}`);
    }
  }
} catch (err) {
  fehler.push({ verein: 'Handball insgesamt', fehler: err.message });
  log(`✗  Handball konnte nicht geladen werden: ${err.message}`);
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
log(`  Fehler         ${fehler.length}`);
const jeSportart = new Map();
for (const [, s] of staffeln) jeSportart.set(s.sportart ?? '—', (jeSportart.get(s.sportart ?? '—') ?? 0) + 1);
for (const [s, n] of jeSportart) log(`    ${s.padEnd(12)} ${n} Ligen`);
