// Spieltag: Was machen meine Mannschaften heute?
//
//   node scripts/live.mjs                       einmal nachsehen
//   node scripts/live.mjs --schleife 150 --takt 3   150 Minuten lang alle 3 Minuten
//
// Drei Quellen, in dieser Reihenfolge:
//
//   1. FuPa (api.fupa.net) – offene Schnittstelle, und dort stehen die
//      **Spielernamen im Klartext**. Torschütze, Karten, Wechsel. Die Vereine
//      tickern selbst, deshalb ist das freiwillig veröffentlicht.
//   2. fussball.de – Minute und Ereignisart, aber keine Namen: die sind dort in
//      privaten Unicode-Zeichen mit wechselnder Spezialschrift versteckt, und
//      diese Sperre wird nicht umgangen.
//
// WELCHE QUELLE GEWINNT, entscheidet sich pro Partie, nicht pauschal. FuPa
// listet auch Partien, die niemand betreut: der Eintrag bleibt dann leer,
// während auf fussball.de Ergebnis und Ereignisse längst gepflegt sind. Bleibt
// ein FuPa-Eintrag lange nach dem Anpfiff leer, wird deshalb bei fussball.de
// gegengeprüft und der reichhaltigere Datensatz genommen (siehe `guete`).
//   3. handball.net – Spielpläne und Ergebnisse der Handballmannschaften.
//
// ZUM TAKT: GitHub drosselt geplante Läufe hart – ein `*/10`-Zeitplan wurde am
// 14.08.2026 tatsächlich nur siebenmal in vier Stunden ausgeführt, also eher
// stündlich. Ein einzelner Lauf darf dagegen bis zu sechs Stunden arbeiten.
// Deshalb der Schleifenmodus: der Workflow bestellt nur noch wenige Läufe pro
// Spieltag, bekommt aber echte Drei-Minuten-Aktualität.

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
const zz = (n) => String(n).padStart(2, '0');

// ── Aufrufparameter ─────────────────────────────────────────────────────────
function zahlArgument(name, vorgabe) {
  const i = process.argv.indexOf(name);
  if (i < 0) return vorgabe;
  const n = Number.parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) ? n : vorgabe;
}
const SCHLEIFE_MIN = zahlArgument('--schleife', 0);
const TAKT_MIN = Math.max(1, zahlArgument('--takt', 3));

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

// ── Namen, unter denen meine Mannschaften auftreten können ──────────────────
// Die eigene Liste schreibt „Grafschafter SV 1910 Moers“, fussball.de und FuPa
// schreiben „GSV Moers“. Deshalb werden beide Schreibweisen gesammelt.
function eigeneMannschaften(sportart) {
  const raus = [];
  for (const m of tabellen.mannschaften) {
    if ((m.sportart ?? 'Fußball') !== sportart) continue;
    const namen = new Set([m.verein]);
    if (m.heimatverein) namen.add(m.heimatverein);
    const zeile = tabellen.staffeln?.[m.staffelId]?.zeilen?.find((z) => z.teamId === m.teamId);
    if (zeile?.verein) namen.add(zeile.verein);
    raus.push({ ...m, kerne: [...namen].map(fupa.namensKern).filter((k) => k.length > 4) });
  }
  return raus;
}

const meineFussball = eigeneMannschaften('Fußball');
const meineHandball = eigeneMannschaften('Handball');

const passtZu = (liste, name) => {
  const k = fupa.namensKern(name);
  if (k.length < 5) return null;
  return liste.find((m) => m.kerne.some((eig) => k === eig || k.includes(eig) || eig.includes(k))) ?? null;
};

const terminLesen = (roh) => {
  const m = String(roh).match(/(\d{2}\.\d{2}\.)(?:\d{4})?\s*-\s*(\d{2}:\d{2})/);
  return m ? { tag: m[1], zeit: m[2] } : null;
};

/**
 * Wie viel Substanz trägt ein Datensatz? Damit wird entschieden, welche Quelle
 * eine Partie beschreiben darf.
 *
 * Gewichtung: ein Ergebnis wiegt am schwersten, dann die Zahl der Ereignisse,
 * Spielernamen zählen nur als Stichentscheid. So gewinnt FuPa bei gleicher
 * Faktenlage (weil nur dort Namen stehen), verliert aber gegen eine Quelle,
 * die überhaupt etwas zu berichten hat.
 */
function guete(p) {
  // Ein gemeldetes, aber verschleiertes Ergebnis ist immer noch mehr wert als
  // eine völlig leere Partie – die Karte kann dann wenigstens darauf verweisen.
  const ergebnis = p.tore ? 6 : (p.ergebnisGemeldet ? 3 : 0);
  const ereignisse = (p.ereignisse ?? []).length * 2;
  const namen = (p.ereignisse ?? []).filter((e) => e.spieler).length;
  return ergebnis + ereignisse + namen;
}

/**
 * Ist die Partie so lange angepfiffen, dass Daten dastehen müssten? Vor dem
 * Anpfiff ist ein leerer Eintrag völlig richtig und keine Gegenprobe wert.
 */
function laengstAngepfiffen(p) {
  const t = Date.parse(p.anpfiff);
  return Number.isFinite(t) && Date.now() > t + 10 * 60_000;
}

/**
 * Namen aus dem unterlegenen Datensatz nachtragen.
 *
 * fussball.de kennt Minute und Ereignisart, verschleiert aber die Namen; FuPa
 * hat sie im Klartext, tickert dafür manchmal nur die Hälfte. Gewinnt
 * fussball.de, lassen sich die FuPa-Namen anhängen – aber nur bei **exakt**
 * gleicher Minute und gleichem Ereigniszeichen und nur, wenn genau ein
 * Ereignis in Frage kommt. Ein falsch zugeordneter Torschütze wäre schlimmer
 * als gar kein Name.
 */
function namenNachtragen(sieger, verlierer) {
  const quelle = (verlierer.ereignisse ?? []).filter((e) => e.spieler);
  if (quelle.length === 0) return 0;
  let getroffen = 0;
  for (const e of sieger.ereignisse ?? []) {
    if (e.spieler) continue;
    const passend = quelle.filter((q) => q.minute === e.minute && q.zeichen === e.zeichen);
    if (passend.length !== 1) continue;
    e.spieler = passend[0].spieler;
    e.fuer = passend[0].fuer ?? null;
    getroffen += 1;
  }
  return getroffen;
}

/**
 * Lohnt sich ein Abruf gerade überhaupt?
 *
 * Ein Zwei-Minuten-Zeitgeber liefe sonst rund um die Uhr gegen FuPa und
 * fussball.de – nachts, wochentags, monatelang. Das ist unhöflich und führt
 * zur Sperre: handball.net hat genau dafür am 15.08.2026 dichtgemacht.
 *
 * Deshalb wird nur gearbeitet, wenn eine der drei Bedingungen zutrifft:
 *   * der gespeicherte Stand ist nicht von heute (der Tagesplan muss neu),
 *   * er ist älter als eine Stunde (Nachzügler und Absagen mitnehmen),
 *   * oder es läuft gerade ein Spielfenster.
 */
function abrufLohntSich() {
  if (!existsSync(ZIEL)) return { ja: true, grund: 'noch kein Stand vorhanden' };

  let alt;
  try { alt = JSON.parse(readFileSync(ZIEL, 'utf8')); } catch { return { ja: true, grund: 'Stand unlesbar' }; }

  const jetzt = new Date();
  const heuteKurz = `${zz(jetzt.getDate())}.${zz(jetzt.getMonth() + 1)}.`;
  if (alt.tag !== heuteKurz) return { ja: true, grund: 'Tagesplan fehlt für heute' };

  const alterMin = (Date.now() - Date.parse(alt.aktualisiert ?? 0)) / 60000;
  if (!Number.isFinite(alterMin) || alterMin > 60) return { ja: true, grund: 'Stand älter als eine Stunde' };

  const anpfiffe = (alt.partien ?? []).map((p) => Date.parse(p.anpfiff)).filter(Number.isFinite);
  if (anpfiffe.length === 0) return { ja: false, grund: 'heute keine Partien angesetzt' };

  // Zwanzig Minuten vor dem ersten Anpfiff bis zweieinhalb Stunden nach dem
  // letzten – davor und danach ändert sich nichts mehr.
  const von = Math.min(...anpfiffe) - 20 * 60_000;
  const bis = Math.max(...anpfiffe) + 150 * 60_000;
  if (Date.now() < von) return { ja: false, grund: `erster Anpfiff ${new Date(Math.min(...anpfiffe)).toTimeString().slice(0, 5)} Uhr` };
  if (Date.now() > bis) return { ja: false, grund: 'alle Partien vorbei' };

  return { ja: true, grund: 'Spielfenster läuft' };
}

/** Sammelt den heutigen Spieltag aus allen Quellen. */
async function spieltagSammeln() {
  const heute = new Date();
  const heuteISO = `${heute.getFullYear()}-${zz(heute.getMonth() + 1)}-${zz(heute.getDate())}`;
  const heuteKurz = `${zz(heute.getDate())}.${zz(heute.getMonth() + 1)}.`;

  const partien = [];
  const gesehen = new Set();

  // ── 1) FuPa ───────────────────────────────────────────────────────────────
  for (const gebiet of GEBIETE) {
    let alle = [];
    try {
      alle = await fupa.partienAmTag(gebiet, heuteISO);
    } catch (err) {
      log(`  FuPa/${gebiet}: ${err.message}`);
      continue;
    }

    for (const p of alle) {
      const meins = passtZu(meineFussball, p.heim) ?? passtZu(meineFussball, p.gast);
      if (!meins || gesehen.has(p.id)) continue;
      gesehen.add(p.id);

      // Der Einzelabruf lohnt sich immer: nur dort stehen die Mannschaftsnamen
      // mit Zusatz („… II“), Schiedsrichter und Zuschauerzahl.
      let verlauf = { ereignisse: [], tore: p.tore, zuschauer: null, schiedsrichter: null, abschnitt: p.abschnitt, tickerAutor: null, heim: null, gast: null };
      try { verlauf = await fupa.spielverlauf(p.id); } catch { /* Grundgerüst bleibt */ }
      await warte(PAUSE_MS);

      partien.push({
        quelle: 'FuPa',
        sportart: 'Fußball',
        url: `https://www.fupa.net/match/${p.slug}`,
        verein: meins.verein,
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
        hatTicker: p.hatTicker,
        abschnitt: verlauf.abschnitt ?? p.abschnitt,
        hinweis: hinweisKlartext(p.hinweis),
      });
    }
  }

  // ── 2) fussball.de: Rückfall und Gegenprobe ───────────────────────────────
  // Abgeglichen wird über die eigene Mannschaft und die Anstoßzeit, nicht über
  // die Paarung: die Quellen schreiben Gegner unterschiedlich („ETB Schwarz-Weiß
  // Essen“ gegen „ETB SW Essen“), und fussball.de hängt Reserven ein „II“ an.
  //
  // Gemerkt wird der Platz im Feld, nicht nur die Tatsache – eine Partie, die
  // FuPa zwar kennt, aber nicht pflegt, wird hier durch den fussball.de-Stand
  // ersetzt.
  const bekannt = new Map();
  partien.forEach((p, i) => {
    for (const seite of [p.heim, p.gast]) {
      const meins = passtZu(meineFussball, seite);
      if (meins) bekannt.set(`${meins.verein}|${p.zeit ?? ''}`, i);
    }
  });

  for (const m of meineFussball) {
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
      const termin = terminLesen(s.datum);
      const schluessel = `${m.verein}|${termin?.zeit ?? ''}`;
      const platz = bekannt.get(schluessel);
      const ausFupa = platz == null ? null : partien[platz];

      // Steht die Partie schon aus FuPa da, wird sie nur dann noch einmal
      // abgerufen, wenn dort etwas fehlt, obwohl es längst dastehen müsste.
      // Sonst wäre das ein zweiter Abruf ohne Erkenntnisgewinn.
      if (ausFupa) {
        const luecke = !ausFupa.tore
          || (ausFupa.hatTicker && (ausFupa.ereignisse ?? []).length === 0);
        if (!luecke || !laengstAngepfiffen(ausFupa)) continue;
      } else {
        bekannt.set(schluessel, partien.length);
        // Treffen zwei eigene Mannschaften aufeinander, würde die Partie sonst
        // zweimal auftauchen – einmal je Mannschaft.
        for (const seite of [s.heim, s.gast]) {
          const gegner = passtZu(meineFussball, seite);
          if (gegner) bekannt.set(`${gegner.verein}|${termin?.zeit ?? ''}`, partien.length);
        }
      }

      const verlauf = await fussballdeVerlauf(s.url);
      await warte(PAUSE_MS);

      let anpfiff = null;
      if (termin?.zeit) {
        const [std, min] = termin.zeit.split(':').map(Number);
        const d = new Date(heute);
        d.setHours(std, min, 0, 0);
        anpfiff = d.toISOString();
      }

      const datensatz = {
        quelle: 'fussball.de',
        sportart: 'Fußball',
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
        // Der Spielstand wird dort aus den Tor-Ereignissen gezählt – ohne ein
        // einziges Ereignis wäre das ein vorgetäuschtes 0:0 statt „nichts da“.
        tore: verlauf?.tore ?? null,
        // Ergebnis steht auf der Spielseite, ist dort aber nur als private
        // Unicode-Zeichen abgebildet. Nicht entschlüsselt – nur vermerkt.
        ergebnisGemeldet: verlauf?.ergebnisGemeldet ?? false,
        // Ohne Namen – die sind bei fussball.de verschleiert.
        ereignisse: (verlauf?.ereignisse ?? []).map((e) => ({
          minute: e.minute, nachspielzeit: 0, art: e.art, name: e.name,
          zeichen: e.zeichen, spieler: null, fuer: null, stand: null, seite: e.seite,
        })),
        zuschauer: null,
        schiedsrichter: null,
        hatTicker: false,
        abschnitt: null,
        // Der Vermerk auf der Spielseite ist aktueller als der im Spielplan.
        hinweis: hinweisKlartext(verlauf?.vermerk || s.hinweis),
      };

      if (!ausFupa) {
        partien.push(datensatz);
        continue;
      }

      // Gegenprobe: nur übernehmen, wenn dort wirklich mehr steht.
      if (guete(datensatz) <= guete(ausFupa)) {
        log(`  ${m.verein}: FuPa bleibt (${guete(ausFupa)} zu ${guete(datensatz)})`);
        continue;
      }
      const uebernommen = namenNachtragen(datensatz, ausFupa);
      // Was FuPa auch bei leerem Ticker weiß, geht nicht verloren.
      datensatz.zuschauer = ausFupa.zuschauer ?? null;
      datensatz.schiedsrichter = ausFupa.schiedsrichter ?? null;
      partien[platz] = datensatz;
      log(`  ${m.verein}: fussball.de übernimmt (${guete(datensatz)} zu ${guete(ausFupa)}`
        + `${uebernommen ? `, ${uebernommen} Namen von FuPa` : ''})`);
    }
  }

  // ── 3) Handball ───────────────────────────────────────────────────────────
  // Die Spielpläne holt scripts/tabellen.mjs alle 30 Minuten mit; hier werden
  // sie nur gelesen. handball.net gegen einen Zwei-Minuten-Takt zu fahren wäre
  // unhöflich und führt zur Sperre – am 15.08.2026 genau so passiert.
  for (const m of meineHandball) {
    for (const s2 of m.naechste ?? []) {
      if (s2.tag !== heuteISO) continue;
      partien.push({
        quelle: 'handball.net',
        sportart: 'Handball',
        url: s2.url,
        verein: m.verein,
        heimatverein: m.heimatverein ?? null,
        ort: m.ort,
        zone: m.zone,
        liga: m.liga,
        wettbewerb: s2.wettbewerb,
        anpfiff: s2.anpfiff,
        zeit: s2.zeit,
        heim: s2.heim,
        gast: s2.gast,
        tore: s2.tore,
        ereignisse: [],
        zuschauer: null,
        schiedsrichter: null,
        hatTicker: false,
        abschnitt: null,
        hinweis: hinweisKlartext(s2.hinweis),
      });
    }
  }

  // ── Zeitliche Einordnung ──────────────────────────────────────────────────
  for (const p of partien) {
    const seit = p.anpfiff ? Math.round((Date.now() - Date.parse(p.anpfiff)) / 60000) : null;
    p.seitAnpfiffMin = seit;
    // Handball dauert 60 Minuten plus Pause, Fußball 90 – zwei Stunden decken
    // beides ab. FuPa sagt den Abschnitt ohnehin selbst.
    p.laeuft = p.abschnitt === 'LIVE' || (p.abschnitt == null && seit != null && seit >= 0 && seit <= 120);
    p.abgeschlossen = p.abschnitt === 'POST' || (p.abschnitt == null && seit != null && seit > 120);
  }
  partien.sort((a, b) => String(a.zeit).localeCompare(String(b.zeit)));

  return { partien, heuteKurz, heuteISO };
}

/** Schreibt data/live.json – lässt aber einen bespielten Tag stehen. */
function schreiben({ partien, heuteKurz, heuteISO }) {
  if (partien.length === 0 && existsSync(ZIEL)) {
    try {
      const alt = JSON.parse(readFileSync(ZIEL, 'utf8'));
      if ((alt.partien ?? []).length > 0 && alt.tag !== heuteKurz) {
        log('Heute spielt niemand – der letzte Spieltag bleibt stehen.');
        return false;
      }
    } catch { /* kaputte Datei einfach ersetzen */ }
  }

  mkdirSync(DATEN, { recursive: true });
  writeFileSync(ZIEL, JSON.stringify({
    aktualisiert: new Date().toISOString(),
    tag: heuteKurz,
    datum: heuteISO,
    hinweisVerzoegerung: 'Der Stand wird während der Spiele alle paar Minuten geholt. '
      + 'Für die Minute bitte dem Link zur Quelle folgen.',
    hinweisNamen: 'Spielernamen stammen von FuPa, wo die Vereine selbst tickern – dort sind sie offen '
      + 'veröffentlicht. Partien ohne FuPa-Ticker kommen von fussball.de: dort gibt es Minute und '
      + 'Ereignisart, aber keine Namen.',
    partien,
  }, null, 1) + '\n', 'utf8');
  return true;
}

// ── Ablauf ──────────────────────────────────────────────────────────────────
const bilanz = (p) => `${p.length} Partien` +
  ` (${p.filter((x) => x.quelle === 'FuPa').length} FuPa,` +
  ` ${p.filter((x) => x.quelle === 'fussball.de').length} fussball.de,` +
  ` ${p.filter((x) => x.quelle === 'handball.net').length} Handball),` +
  ` ${p.filter((x) => x.laeuft && !x.abgeschlossen).length} laufen,` +
  ` ${p.filter((x) => x.ereignisse.some((e) => e.spieler)).length} mit Namen`;

if (SCHLEIFE_MIN <= 0) {
  const wache = abrufLohntSich();
  if (!wache.ja && process.argv.indexOf('--immer') < 0) {
    log(`Kein Abruf nötig: ${wache.grund}.`);
    process.exit(0);
  }
  const stand = await spieltagSammeln();
  schreiben(stand);
  log(`geschrieben: ${bilanz(stand.partien)}`);
} else {
  const ende = Date.now() + SCHLEIFE_MIN * 60_000;
  let runde = 0;
  log(`Schleifenmodus: ${SCHLEIFE_MIN} Minuten, alle ${TAKT_MIN} Minuten\n`);

  while (Date.now() < ende) {
    runde++;
    const t0 = Date.now();
    try {
      const stand = await spieltagSammeln();
      schreiben(stand);
      log(`[${new Date().toTimeString().slice(0, 5)}] Runde ${runde}: ${bilanz(stand.partien)}`);

      // Wenn alle Partien durch sind, muss nicht weitergeschaut werden.
      if (stand.partien.length > 0 && stand.partien.every((p) => p.abgeschlossen)) {
        log('Alle Partien abgeschlossen – Schleife wird beendet.');
        break;
      }
    } catch (err) {
      log(`[${new Date().toTimeString().slice(0, 5)}] Runde ${runde} fehlgeschlagen: ${err.message}`);
    }

    const rest = TAKT_MIN * 60_000 - (Date.now() - t0);
    if (Date.now() + Math.max(rest, 0) >= ende) break;
    if (rest > 0) await warte(rest);
  }
  log(`\nSchleife beendet nach ${runde} Runden.`);
}
