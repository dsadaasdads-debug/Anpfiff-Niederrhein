// Regelwerk: Ist ein Artikel Sport, wo spielt er, und wie schwer wiegt er?
//
// Bewusst ohne Sprachmodell. Im Zuschnitt von vier Städten ist eine gepflegte
// Vereins- und Ortsliste treffsicherer als jede Klassifikation – und sie ist
// nachvollziehbar: jeder Treffer trägt seinen Grund im Datensatz mit.

import { VEREINE, ORTE, ZONEN, SPORT_WOERTER, AUSSCHLUSS_WOERTER } from '../clubs.mjs';

// Ortsnamen, die außerhalb eines URL-Pfads mehrdeutig sind. "Alpen" ist ein
// Gebirge, "Homberg" gibt es mehrfach in NRW, "Kapellen" auch bei Grevenbroich.
const NUR_IM_PFAD = new Set(['Alpen', 'Homberg', 'Kapellen', 'Neukirchen', 'Kamp', 'Beeck', 'Eick', 'Veen']);

const WORTGRENZE = '(?<![A-Za-zÄÖÜäöüß0-9])';
const WORTENDE = '(?![A-Za-zÄÖÜäöüß0-9])';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Exakter Worttreffer. Für Vereinsnamen, die genau so stehen müssen. */
function enthaeltWort(text, wort) {
  if (!text || !wort) return false;
  return new RegExp(WORTGRENZE + escape(wort) + WORTENDE, 'i').test(text);
}

/**
 * Worttreffer mit Endungstoleranz. Deutsche Lokalberichterstattung dekliniert
 * munter: "der Rheinberger Nicolas", "die Verbandsliga-Handballer", "Xantenerin".
 * Ohne diese Toleranz gingen genau die Artikel verloren, um die es geht.
 */
function enthaeltStamm(text, stamm) {
  if (!text || !stamm) return false;
  return new RegExp(WORTGRENZE + escape(stamm) + '[a-zäöüß]{0,6}' + WORTENDE, 'i').test(text);
}

// Stichwort → Sportart, für das Etikett in der Oberfläche.
const SPORTARTEN = [
  ['Volleyball', ['Volleyball', 'Moerser SC']],
  ['Eishockey', ['Eishockey', 'Füchse Duisburg', 'DEL2', 'Oberliga Nord']],
  ['Handball', ['Handball']],
  ['Basketball', ['Basketball']],
  ['Leichtathletik', ['Leichtathletik', 'Hürden', 'Sprint', 'Speerwurf', 'Weitsprung', 'Staffel']],
  ['Rudern & Kanu', ['Rudern', 'Ruder', 'Kanu', 'Regatta', 'Regattabahn', 'Drachenboot']],
  ['Schwimmen', ['Schwimmen', 'Schwimm', 'Freibad-Meisterschaft']],
  ['Tennis', ['Tennis']],
  ['Tischtennis', ['Tischtennis']],
  ['Turnen', ['Turnen', 'Turnverein', 'Geräteturnen']],
  ['Reitsport', ['Reiten', 'Reitsport', 'Dressur', 'Springreiten']],
  ['Radsport', ['Radsport', 'Radrennen', 'Gravel', 'Mountainbike']],
  // "Boxen" bewusst nicht als Stamm – sonst schlägt es beim Boxenstopp an.
  ['Kampfsport', ['Judo', 'Karate', 'Taekwondo', 'Boxkampf', 'Boxer', 'Boxsport', 'Ringer']],
  ['Hockey', ['Hockey']],
  ['Triathlon', ['Triathlon', 'Triathlet']],
  ['American Football', ['American Football', 'Rhein Fire', 'Touchdown', 'Quarterback', 'ELF']],
  ['Motorsport', ['Motorsport', 'Kartsport', 'Rallye']],
  ['Schach', ['Schach']],
  ['Kegeln & Bowling', ['Kegeln', 'Kegler', 'Bowling', 'Boule', 'Boccia']],
  ['Dart', ['Dart']],
  // Steht bewusst am Ende: "Testspiel" und "Regionalliga" gibt es auch im
  // Handball, dort greift aber schon die spezifischere Zeile weiter oben.
  ['Fußball', ['Fußball', 'Fussball', 'Kreisliga', 'Bezirksliga', 'Landesliga', 'Verbandsliga',
    'Oberliga', 'Regionalliga', 'Torwart', 'Torhüter', 'Torjäger', 'Stürmer', 'Elfmeter',
    'Niederrheinpokal', 'Kreispokal', 'Testspiel', 'Punktspiel']],
];

/** Normalisiert eine Artikel-URL für den Dublettenabgleich. */
export function urlSchluessel(url) {
  try {
    const u = new URL(url);
    // RP Online hängt an jeden Artikel eine stabile Kennung: _aid-153021145
    const aid = u.pathname.match(/_aid-(\d+)/);
    if (aid) return `rp:${aid[1]}`;
    // Funke: /articleNNNNNNNNN/
    const funke = u.pathname.match(/\/article(\d+)/);
    if (funke) return `funke:${funke[1]}`;
    return (u.host + u.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Findet alle bekannten Vereine, die im Text vorkommen. */
export function vereineFinden(text) {
  const treffer = [];
  for (const verein of VEREINE) {
    if (verein.aliase.some((alias) => enthaeltWort(text, alias))) treffer.push(verein);
  }
  return treffer;
}

/**
 * Bestimmt den Ortsbezug. Der URL-Pfad wiegt schwerer als der Text, weil
 * RP Online den echten Herkunftsort im Pfad führt – die Rubrik im Feed
 * stimmt damit nicht immer überein.
 */
export function ortsbezug({ titel, teaser, url, vereine }) {
  const pfad = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ''; } })();
  const text = `${titel} ${teaser}`;
  const treffer = new Map();

  // Beweiskraft der Signale, absteigend:
  //   3  ein namentlich genannter Verein – der hat einen eindeutigen Sitz
  //   2  der Ort steht im Titel oder Vorschautext
  //   1  der Ort steht nur im URL-Pfad
  //
  // Der Pfad wiegt bewusst am leichtesten: RP Online betreibt gemeinsame
  // Sportredaktionen, ein Bericht über Sonsbeck liegt deshalb unter
  // /staedte/xanten/sport/. Der Pfad nennt die Redaktion, nicht den Schauplatz.
  const merken = (ort, staerke) => {
    const bisher = treffer.get(ort.name) ?? { ort, staerke: 0 };
    bisher.staerke = Math.max(bisher.staerke, staerke);
    treffer.set(ort.name, bisher);
  };

  for (const ort of ORTE) {
    for (const muster of ort.muster) {
      const klein = muster.toLowerCase();
      const imPfad = enthaeltStamm(pfad, klein) || enthaeltStamm(pfad, klein.replace(/ß/g, 'ss'));
      const imText = !NUR_IM_PFAD.has(muster) && enthaeltStamm(text, muster);
      if (imText) { merken(ort, 2); break; }
      if (imPfad) { merken(ort, 1); break; }
    }
  }

  for (const verein of vereine) {
    const ort = ORTE.find((o) => o.name === verein.ort);
    if (ort) merken(ort, 3);
  }

  const gefunden = [...treffer.values()];
  if (gefunden.length === 0) return { orte: [], zone: null, haupt: null };

  // Erst die Beweiskraft, dann die Nähe – so gewinnt ein genannter Verein
  // gegen den bloßen Redaktionspfad, und bei Gleichstand die Kernstadt.
  const rang = { kern: 3, umland: 2, duisburg: 1 };
  gefunden.sort((a, b) => (b.staerke - a.staerke) || (rang[b.ort.zone] - rang[a.ort.zone]));

  return {
    orte: gefunden.map((g) => g.ort.name),
    zone: gefunden[0].ort.zone,
    haupt: gefunden[0].ort.name,
    // Ab Stärke 2 steht der Ort belegt im Text oder folgt aus einem Verein.
    // Bei Stärke 1 stammt er allein aus dem Redaktionspfad und ist zu unsicher,
    // um ihn in der App als Ortsmarke auszuweisen.
    sicher: gefunden[0].staerke >= 2,
  };
}

/** Erkennt die Sportart für das Etikett. Fällt auf null zurück. */
export function sportartErkennen(text, vereine) {
  for (const verein of vereine) {
    if (verein.sportart && verein.sportart !== 'Fußball') return verein.sportart;
  }
  for (const [sportart, woerter] of SPORTARTEN) {
    if (woerter.some((w) => enthaeltStamm(text, w))) return sportart;
  }
  return vereine.length > 0 ? 'Fußball' : null;
}

/**
 * Entscheidet, ob ein Eintrag Sport ist – und hält fest, woran das erkannt wurde.
 * @returns {{sport: boolean, grund: string}}
 */
export function istSport({ eintrag, quelle, vereine }) {
  const text = `${eintrag.titel} ${eintrag.beschreibung}`;

  if (AUSSCHLUSS_WOERTER.some((w) => enthaeltWort(text, w))) {
    return { sport: false, grund: 'ausgeschlossen' };
  }

  if (quelle.mode === 'club') return { sport: true, grund: 'vereinsfeed' };

  if (eintrag.rubriken.some((r) => /^sport$/i.test(r.trim()))) {
    return { sport: true, grund: 'rubrik' };
  }

  const pfad = (() => { try { return new URL(eintrag.link).pathname.toLowerCase(); } catch { return ''; } })();
  if (pfad.includes('/sport/')) return { sport: true, grund: 'pfad' };

  if (quelle.mode === 'sport') return { sport: true, grund: 'sportfeed' };

  // In allgemeinen Stadtfeeds reicht ein Stichwort allein nicht – erst der
  // Vereinsname macht daraus verlässlich einen Sportartikel.
  if (vereine.length > 0 && SPORT_WOERTER.some((w) => enthaeltStamm(text, w))) {
    return { sport: true, grund: 'verein' };
  }

  return { sport: false, grund: 'kein-sportsignal' };
}

/**
 * Punkte und Sortierzeit. Die Dämpfung Duisburgs ist als Zeitversatz
 * umgesetzt: ein Duisburger Artikel reiht sich ein, als wäre er 20 Stunden
 * älter. Dadurch verschwindet er nicht, drängt sich aber auch nicht vor.
 */
export function bewerten({ zone, vereine, grund, datum }) {
  const z = ZONEN[zone] ?? { punkte: 0, versatzStunden: -48 };
  let punkte = z.punkte;
  if (vereine.length > 0) punkte += 40;
  if (grund === 'rubrik' || grund === 'pfad' || grund === 'vereinsfeed') punkte += 10;

  const basis = datum ? datum.getTime() : Date.now();
  return { punkte, sortZeit: basis + z.versatzStunden * 3600_000 };
}
