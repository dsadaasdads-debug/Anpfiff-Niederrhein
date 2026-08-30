// Orts- und Vereinswissen für die Filterung und Gewichtung.
//
// Die Fußballvereine in data/clubs-fussball.json wurden über die Vereinssuche
// von fussball.de ermittelt und tragen dort hinterlegte Postleitzahl und Ort.
// Sie lässt sich jederzeit mit scripts/discover-clubs.mjs neu erzeugen.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/** @type {{name:string, ort:string, zone:string, slug:string, id:string}[]} */
const FUSSBALL = JSON.parse(readFileSync(join(HERE, 'data', 'clubs-fussball.json'), 'utf8'));

// Vereine außerhalb des Fußballs, die fussball.de naturgemäß nicht kennt.
// Ergänzt beim Sichten der ersten echten Feed-Durchläufe.
const WEITERE = [
  { name: 'Moerser SC', ort: 'Moers', zone: 'kern', sportart: 'Volleyball',
    aliase: ['Moerser SC', 'Moerser Sportclub'] },
  { name: 'Moerser TV', ort: 'Moers', zone: 'kern', sportart: 'Turnen',
    aliase: ['Moerser TV', 'Moerser Turnverein'] },
  { name: 'Black Tigers Moers', ort: 'Moers', zone: 'kern', sportart: 'Eishockey',
    aliase: ['Black Tigers Moers', 'Black Tigers'] },
  { name: 'TV Schwafheim', ort: 'Moers', zone: 'kern', sportart: 'Handball',
    aliase: ['TV Schwafheim'] },
  { name: 'HSG Moers', ort: 'Moers', zone: 'kern', sportart: 'Handball',
    aliase: ['HSG Moers'] },
  { name: 'RFV Rheurdt', ort: 'Rheurdt', zone: 'umland', sportart: 'Reitsport',
    aliase: ['RFV Rheurdt'] },
  { name: 'RV Eversael', ort: 'Rheinberg', zone: 'umland', sportart: 'Reitsport',
    aliase: ['RV Eversael'] },

  // Beim Durchsehen des „Sonstiges“-Topfs nachgetragen: allesamt Vereine, die
  // regelmäßig in den Feeds auftauchen und die fussball.de nicht kennt, weil
  // sie keinen Fußball spielen.
  { name: 'TuS Lintfort', ort: 'Kamp-Lintfort', zone: 'kern', sportart: 'Handball',
    aliase: ['TuS Lintfort', 'TUS Lintfort'] },
  { name: 'TV Issum', ort: 'Issum', zone: 'umland', sportart: 'Handball',
    aliase: ['TV Issum'] },
  { name: 'Rhein Fire', ort: 'Duisburg', zone: 'duisburg', sportart: 'American Football',
    aliase: ['Rhein Fire'] },
  { name: 'ASV Duisburg', ort: 'Duisburg', zone: 'duisburg', sportart: 'Triathlon',
    aliase: ['ASV Duisburg'] },
  { name: 'ASC Duisburg', ort: 'Duisburg', zone: 'duisburg', sportart: 'Triathlon',
    aliase: ['ASC Duisburg'] },
  { name: 'MSV Duisburg', ort: 'Duisburg', zone: 'duisburg', sportart: 'Fußball',
    aliase: ['MSV Duisburg', 'MSV', 'Meidericher SV', 'Zebras'] },
  { name: 'Füchse Duisburg', ort: 'Duisburg', zone: 'duisburg', sportart: 'Eishockey',
    aliase: ['Füchse Duisburg', 'EV Duisburg'] },
  { name: 'Regattabahn Duisburg', ort: 'Duisburg', zone: 'duisburg', sportart: 'Rudern & Kanu',
    aliase: ['Regattabahn', 'Sportpark Duisburg', 'Wedau'] },
];

/**
 * Alle bekannten Vereine, vereinheitlicht.
 * `aliase` sind die Zeichenketten, auf die im Artikeltext geprüft wird.
 */
export const VEREINE = [
  ...FUSSBALL.map((c) => ({
    name: c.name,
    ort: c.ort,
    zone: c.zone,
    sportart: 'Fußball',
    slug: c.slug,
    fussballDeId: c.id,
    aliase: aliaseFuer(c.name),
  })),
  ...WEITERE,
];

/**
 * Erzeugt Suchvarianten aus einem Vereinsnamen: der volle Name, die Fassung
 * ohne Jahreszahlen und Rechtsform, sowie der Kern ohne Präfix wie "SV" oder "FC".
 * Zu kurze oder zu allgemeine Varianten werden verworfen, damit "Kamp" nicht
 * jeden Artikel über Kamp-Lintfort zu einem Vereinstreffer macht.
 */
function aliaseFuer(name) {
  const out = new Set([name]);
  const ohneJahr = name
    .replace(/\b(1[89]\d{2}|20\d{2})(\/\d{2})?\b/g, ' ')
    .replace(/\be\.?\s?V\.?\b/gi, ' ')
    .replace(/\b\d{2}\/\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.]+$/, '');
  if (ohneJahr.length >= 6) out.add(ohneJahr);
  return [...out].filter((a) => a.length >= 6);
}

/** Zonen und ihre Gewichtung. Duisburg wird bewusst gedämpft. */
export const ZONEN = {
  kern: { label: 'Kernstädte', punkte: 100, versatzStunden: 0 },
  umland: { label: 'Umland', punkte: 60, versatzStunden: -8 },
  duisburg: { label: 'Duisburg', punkte: 30, versatzStunden: -20 },
};

/**
 * Orte, die einen Artikel lokal verankern. Der Schlüssel ist der Anzeigename,
 * `muster` sind die Schreibweisen im Text bzw. im URL-Pfad.
 */
export const ORTE = [
  { name: 'Moers', zone: 'kern', muster: ['Moers', 'Moerser', 'Repelen', 'Kapellen', 'Scherpenberg', 'Meerbeck', 'Rheinkamp', 'Asberg', 'Schwafheim', 'Hochstraß', 'Utfort', 'Vinn', 'Hülsdonk', 'Eick'] },
  { name: 'Kamp-Lintfort', zone: 'kern', muster: ['Kamp-Lintfort', 'Lintfort', 'Hoerstgen', 'Hörstgen', 'Saalhoff', 'Niersenbruch', 'Kamperbruch'] },
  { name: 'Neukirchen-Vluyn', zone: 'kern', muster: ['Neukirchen-Vluyn', 'Neukirchen', 'Vluyn', 'Rayen'] },
  { name: 'Rheinberg', zone: 'umland', muster: ['Rheinberg', 'Budberg', 'Orsoy', 'Borth', 'Ossenberg', 'Millingen', 'Vierbaum'] },
  { name: 'Rheurdt', zone: 'umland', muster: ['Rheurdt', 'Schaephuysen'] },
  { name: 'Alpen', zone: 'umland', muster: ['Alpen', 'Menzelen', 'Veen', 'Bönninghardt'] },
  { name: 'Xanten', zone: 'umland', muster: ['Xanten', 'Lüttingen', 'Vynen', 'Marienbaum', 'Wardt'] },
  // Sonsbeck liegt außerhalb des gewünschten Umlands, taucht aber ständig auf,
  // weil RP es aus derselben Sportredaktion wie Xanten bedient. Aufgenommen,
  // damit solche Artikel richtig beschriftet sind statt fälschlich als Xanten.
  { name: 'Sonsbeck', zone: 'umland', muster: ['Sonsbeck', 'Labbeck'] },
  { name: 'Issum', zone: 'umland', muster: ['Issum', 'Sevelen'] },
  { name: 'Duisburg', zone: 'duisburg', muster: ['Duisburg', 'Duisburger', 'Meiderich', 'Rheinhausen', 'Homberg', 'Baerl', 'Rumeln', 'Kaldenhausen', 'Walsum', 'Wedau', 'Neuenkamp', 'Beeck', 'Hamborn', 'Ruhrort'] },
];

/**
 * Sport-Stichwörter. Sie entscheiden nur mit, wenn kein eindeutiges Signal aus
 * Rubrik oder URL vorliegt – deshalb bewusst sportartbezogen und nicht zu weit.
 */
export const SPORT_WOERTER = [
  'Fußball', 'Fussball', 'Kreisliga', 'Bezirksliga', 'Landesliga', 'Oberliga', 'Regionalliga',
  'Verbandsliga', 'Kreispokal', 'Niederrheinpokal', 'Spieltag', 'Auswärtsspiel', 'Heimspiel',
  'Torwart', 'Trainer', 'Aufstieg', 'Abstieg', 'Tabellenführer', 'Derby', 'Testspiel', 'Vorbereitung',
  'Volleyball', 'Bundesliga', 'Handball', 'Basketball', 'Eishockey', 'Hockey',
  'Leichtathletik', 'Schwimmen', 'Turnen', 'Rudern', 'Kanu', 'Regatta', 'Triathlon',
  'Judo', 'Ringen', 'Boxen', 'Tennis', 'Tischtennis', 'Badminton', 'Reiten', 'Radsport',
  'Meisterschaft', 'Deutsche Meisterschaft', 'Stadtmeisterschaft', 'Turnier', 'Wettkampf',
  'Sportverein', 'Sportlerin', 'Sportler', 'Mannschaft', 'Saisonstart', 'Saisonauftakt',
];

/** Wörter, die trotz Sporttreffer aussortieren – Vereinsleben statt Wettkampf. */
export const AUSSCHLUSS_WOERTER = [
  'Sportwetten', 'Wettanbieter', 'Bundesliga-Tippspiel', 'Kickbase', 'Transferticker',
];

/**
 * Verwaltungskram aus Vereinsfeeds. Diese Feeds gelten pauschal als Sport,
 * weil sie einem Verein gehören – dadurch rutschen aber auch Öffnungszeiten
 * und Versammlungseinladungen durch.
 */
export const VEREINSINTERN_WOERTER = [
  // Verwaltung
  'Geschäftsstelle', 'Geschaeftsstelle', 'Mitgliederversammlung', 'Jahreshauptversammlung',
  'Hauptversammlung', 'Betriebsferien', 'Mitgliedsbeitrag', 'Beitragsanpassung',
  'Beitragserhöhung', 'Öffnungszeiten', 'Oeffnungszeiten', 'Satzung', 'Datenschutzerklärung',
  // Werbung und Vermarktung
  'Sponsor', 'Sponsoring', 'Werbepartner', 'Businesspartner', 'Business Partner',
  'Partnerschaft', 'Fanshop', 'Merchandise', 'Trikotpartner', 'Ausrüster',
  // Geselligkeit und Ehrungen
  'Weihnachtsfeier', 'Vereinsausflug', 'Planwagenfahrt', 'Tombola', 'Geburtstag',
  'Ehrennadel', 'Ehrenmitglied', 'Jubilar', 'Grillfest', 'Sommerfest',
];
