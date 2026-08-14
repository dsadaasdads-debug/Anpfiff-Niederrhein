// Spieltag: Was machen meine Mannschaften heute?
//
//   node scripts/live.mjs
//
// Zwei Quellen, in dieser Reihenfolge:
//
//   1. FuPa (api.fupa.net) – offene Schnittstelle, und dort stehen die
//      **Spielernamen im Klartext**. Torschütze, Karten, Wechsel. Die Vereine
//      tickern selbst, deshalb ist das freiwillig veröffentlicht.
//   2. fussball.de – für Partien ohne FuPa-Ticker. Liefert Minute und
//      Ereignisart, aber keine Namen: die sind dort in privaten Unicode-Zeichen
//      mit wechselnder Spezialschrift versteckt, und diese Sperre wird nicht
//      umgangen.
//
// EHRLICHE EINORDNUNG: Kein Ticker in Echtzeit. GitHub Actions stößt frühestens
// alle fünf Minuten an und verzögert unter Last. Rechne mit einer Viertelstunde
// Rückstand; für die Minute führt der Link zur Quelle.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as fupa from './lib/fupa.mjs';
import { spielverlauf as fussballdeVerlauf } from './lib/spielverlauf.mjs';
import { spiele } from './lib/fussballde.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATEN = join(HERE, '..', 'data');
const ZIEL = join(DATEN, 'live.json');
const QUELLE = join(DATEN, 'tabellen.json');

// FuPa ordnet unsere Vereine diesen Gebieten zu: der Kreis Moers für die
// Kreisligen, „niederrhein“ für Bezirks-, Landes- und Oberliga.
const GEBIETE = ['moers', 'niederrhein'];
const PAUSE_MS = 400;

const log = (...a) => console.log(...a);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Verwaltungsdeutsch in gebräuchliche Wörter übersetzen. fussball.de schreibt
 * „Absetzung“, wenn der Staffelleiter eine Partie abgesetzt hat – gemeint ist,
 * dass sie nicht stattfindet.
 */
function hinweisKlartext(roh) {
  if (!roh) return null;
  const t = String(roh).trim();
  const tabelle = [
    [/^absetzung$/i, 'abgesagt'],
    [/^abgesetzt$/i, 'abgesagt'],
    [/^ausfall$/i, 'ausgefallen'],
    [/^spielabbruch$/i, 'abgebrochen'],
    [/^abbruch$/i, 'abgebrochen'],
    [/^verlegung$/i, 'verlegt'],
    [/^wertung$/i, 'am grünen Tisch gewertet'],
    [/^nichtantritt$/i, 'nicht angetreten'],
  ];
  for (const [muster, klar] of tabelle) if (muster.test(t)) return klar;
  return t;
}

if (!existsSync(QUELLE)) {
  log('data/tabellen.json fehlt – erst scripts/tabellen.mjs laufen lassen.');
  process.exit(0);
}
const tabellen = JSON.parse(readFileSync(QUELLE, 'utf8'));

const heute = new Date();
const zz = (n) => String(n).padStart(2, '0');
const heuteISO = `${heute.getFullYear()}-${zz(heute.getMonth() + 1)}-${zz(heute.getDate())}`;
const heuteKurz = `${zz(heute.getDate())}.${zz(heute.getMonth() + 1)}.`;

// ── Namen, unter denen meine Mannschaften auftreten können ──────────────────
// Die eigene Liste schreibt „Grafschafter SV 1910 Moers“, fussball.de und FuPa
// schreiben „GSV Moers“. Deshalb werden beide Schreibweisen gesammelt.
const meine = [];
for (const m of tabellen.mannschaften) {
  if ((m.sportart ?? 'Fußball') !== 'Fußball') continue;
  const namen = new Set([m.verein]);
  if (m.heimatverein) namen.add(m.heimatverein);
  const zeile = tabellen.staffeln?.[m.staffelId]?.zeilen?.find((z) => z.teamId === m.teamId);
  if (zeile?.verein) namen.add(zeile.verein);
  meine.push({ ...m, kerne: [...namen].map(fupa.namensKern).filter((k) => k.length > 4) });
}
log(`${meine.length} eigene Fußballmannschaften, ${heuteKurz}`);

const passtZuMir = (name) => {
  const k = fupa.namensKern(name);
  if (k.length < 5) return null;
  return meine.find((m) => m.kerne.some((eig) => k === eig || k.includes(eig) || eig.includes(k))) ?? null;
};

// ── 1) FuPa ─────────────────────────────────────────────────────────────────
const partien = [];
const gesehen = new Set();

for (const gebiet of GEBIETE) {
  let alle = [];
  try {
    alle = await fupa.partienAmTag(gebiet, heuteISO);
  } catch (err) {
    log(`  FuPa-Gebiet ${gebiet}: ${err.message}`);
    continue;
  }
  log(`  FuPa/${gebiet}: ${alle.length} Partien am Tag`);

  for (const p of alle) {
    const meins = passtZuMir(p.heim) ?? passtZuMir(p.gast);
    if (!meins) continue;
    if (gesehen.has(p.id)) continue;
    gesehen.add(p.id);

    // Der Einzelabruf lohnt sich immer: nur dort stehen die Mannschaftsnamen
    // mit Zusatz („… II“), Schiedsrichter und Zuschauerzahl. Bei rund zehn
    // Partien am Tag fällt der zusätzliche Abruf nicht ins Gewicht.
    let verlauf = { ereignisse: [], tore: p.tore, zuschauer: null, schiedsrichter: null, abschnitt: p.abschnitt, tickerAutor: null, heim: null, gast: null };
    try { verlauf = await fupa.spielverlauf(p.id); } catch { /* bleibt beim Grundgerüst */ }
    await warte(PAUSE_MS);

    partien.push({
      quelle: 'FuPa',
      url: `https://www.fupa.net/match/${p.slug}`,
      verein: meins.verein,
      // Für den Abgleich mit den gemerkten Vereinen: „TuS Lintfort II“ soll
      // zum gemerkten „TuS Lintfort“ passen.
      heimatverein: meins.heimatverein ?? null,
      ort: meins.ort,
      zone: meins.zone,
      liga: meins.liga,
      wettbewerb: p.wettbewerb,
      anpfiff: p.anpfiff,
      zeit: p.anpfiff ? new Date(p.anpfiff).toTimeString().slice(0, 5) : null,
      heim: verlauf.heim ?? p.heim,
      gast: verlauf.gast ?? p.gast,
      tore: verlauf.tore ?? p.tore,
      ereignisse: verlauf.ereignisse,
      zuschauer: verlauf.zuschauer,
      schiedsrichter: verlauf.schiedsrichter,
      tickerAutor: verlauf.tickerAutor,
      hatTicker: p.hatTicker,
      abschnitt: verlauf.abschnitt ?? p.abschnitt,
      hinweis: hinweisKlartext(p.hinweis),
    });

    const stand = verlauf.tore ? `${verlauf.tore.heim}:${verlauf.tore.gast}` : '–:–';
    const namen = verlauf.ereignisse.filter((e) => e.spieler).length;
    log(`    ${(p.heim + ' – ' + p.gast).slice(0, 46).padEnd(48)} ${stand}  ${verlauf.ereignisse.length} Ereignisse, ${namen} mit Namen`);
  }
}

// ── 2) fussball.de als Rückfall ─────────────────────────────────────────────
// Für Partien, die FuPa nicht führt: Minute und Ereignisart ohne Namen.
//
// Abgeglichen wird über die eigene Mannschaft und die Anstoßzeit, nicht über
// die Paarung: die Quellen schreiben Gegner unterschiedlich („ETB Schwarz-Weiß
// Essen“ gegen „ETB SW Essen“), und fussball.de hängt Reserven ein „II“ an,
// das FuPa weglässt.
const bekannt = new Set();
for (const p of partien) {
  for (const seite of [p.heim, p.gast]) {
    const meins = passtZuMir(seite);
    if (meins) bekannt.add(`${meins.verein}|${p.zeit ?? ''}`);
  }
}

const terminLesen = (roh) => {
  const m = String(roh).match(/(\d{2}\.\d{2}\.)(?:\d{4})?\s*-\s*(\d{2}:\d{2})/);
  return m ? { tag: m[1], zeit: m[2] } : null;
};

for (const m of meine) {
  if (!m.teamId) continue;
  let kandidaten = (m.naechste ?? []).filter((s) => terminLesen(s.datum)?.tag === heuteKurz);
  if (kandidaten.length === 0) {
    try {
      kandidaten = (await spiele(m.teamId, 'next')).filter((s) => terminLesen(s.datum)?.tag === heuteKurz);
      await warte(PAUSE_MS);
    } catch { continue; }
  }

  for (const s of kandidaten) {
    if (!s.url) continue;
    const termin0 = terminLesen(s.datum);
    const schluessel = `${m.verein}|${termin0?.zeit ?? ''}`;
    if (bekannt.has(schluessel)) continue;
    bekannt.add(schluessel);
    // Treffen zwei eigene Mannschaften aufeinander, würde die Partie sonst
    // zweimal auftauchen – einmal je Mannschaft. Deshalb den Gegner gleich
    // mit vermerken.
    for (const seite of [s.heim, s.gast]) {
      const gegner = passtZuMir(seite);
      if (gegner) bekannt.add(`${gegner.verein}|${termin0?.zeit ?? ''}`);
    }

    const verlauf = await fussballdeVerlauf(s.url);
    await warte(PAUSE_MS);
    const termin = terminLesen(s.datum);

    let anpfiff = null;
    if (termin?.zeit) {
      const [std, min] = termin.zeit.split(':').map(Number);
      const d = new Date(heute);
      d.setHours(std, min, 0, 0);
      anpfiff = d.toISOString();
    }

    partien.push({
      quelle: 'fussball.de',
      url: s.url,
      verein: m.verein,
      heimatverein: m.heimatverein ?? null,
      ort: m.ort,
      zone: m.zone,
      liga: m.liga,
      wettbewerb: s.wettbewerb,
      anpfiff,
      zeit: termin?.zeit ?? null,
      heim: verlauf?.heim || s.heim,
      gast: verlauf?.gast || s.gast,
      tore: verlauf?.tore ?? null,
      // Ohne Namen – die sind bei fussball.de verschleiert.
      ereignisse: (verlauf?.ereignisse ?? []).map((e) => ({
        minute: e.minute, nachspielzeit: 0, art: e.art, name: e.name,
        zeichen: e.zeichen, spieler: null, fuer: null, stand: null,
        seite: e.seite,
      })),
      zuschauer: null,
      schiedsrichter: null,
      tickerAutor: null,
      hatTicker: false,
      abschnitt: null,
      hinweis: hinweisKlartext(s.hinweis),
    });
    log(`    [fussball.de] ${(s.heim + ' – ' + s.gast).slice(0, 40).padEnd(42)} ${verlauf?.ereignisse.length ?? 0} Ereignisse, ohne Namen`);
  }
}

// ── Zeitliche Einordnung und Schreiben ──────────────────────────────────────
for (const p of partien) {
  const seit = p.anpfiff ? Math.round((Date.now() - Date.parse(p.anpfiff)) / 60000) : null;
  p.seitAnpfiffMin = seit;
  // FuPa sagt es selbst; sonst entscheidet die Uhr (zwei Stunden reichen für
  // jede Kreisligapartie inklusive Pause und Nachspielzeit).
  p.laeuft = p.abschnitt === 'LIVE' || (p.abschnitt == null && seit != null && seit >= 0 && seit <= 120);
  p.abgeschlossen = p.abschnitt === 'POST' || (p.abschnitt == null && seit != null && seit > 120);
}
partien.sort((a, b) => String(a.zeit).localeCompare(String(b.zeit)));

mkdirSync(DATEN, { recursive: true });
// Ein Spieltag ohne Partien überschreibt den vorigen nicht: sonst wäre die
// Ansicht von Montag bis Freitag leer, statt die Endstände vom Wochenende zu
// zeigen. Erst wenn wieder gespielt wird, rückt der neue Tag nach.
if (partien.length === 0 && existsSync(ZIEL)) {
  try {
    const alt = JSON.parse(readFileSync(ZIEL, 'utf8'));
    if ((alt.partien ?? []).length > 0) {
      log('\nHeute spielt niemand – der letzte Spieltag bleibt stehen.');
      process.exit(0);
    }
  } catch { /* kaputte Datei einfach ersetzen */ }
}

writeFileSync(ZIEL, JSON.stringify({
  aktualisiert: new Date().toISOString(),
  tag: heuteKurz,
  datum: heuteISO,
  hinweisVerzoegerung: 'Der Stand wird alle zehn Minuten geholt und kann entsprechend nachhinken. '
    + 'Für die Minute bitte dem Link zur Quelle folgen.',
  hinweisNamen: 'Spielernamen stammen von FuPa, wo die Vereine selbst tickern – dort sind sie offen '
    + 'veröffentlicht. Partien ohne FuPa-Ticker kommen von fussball.de: dort gibt es Minute und '
    + 'Ereignisart, aber keine Namen.',
  partien,
}, null, 1) + '\n', 'utf8');

const mitNamen = partien.filter((p) => p.ereignisse.some((e) => e.spieler)).length;
log(`\ngeschrieben: ${ZIEL}`);
log(`  ${partien.length} Partien, davon ${partien.filter((p) => p.quelle === 'FuPa').length} über FuPa`);
log(`  ${mitNamen} Partien mit Spielernamen`);
