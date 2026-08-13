// Erzeugt data/clubs-fussball.json aus der Vereinssuche von fussball.de neu.
//
//   node scripts/discover-clubs.mjs
//
// fussball.de erlaubt das Auslesen laut robots.txt ausdrücklich
// (User-agent: * / Allow: / mit nur zwei irrelevanten Ausnahmen).
// Zwischen den Abfragen wird bewusst gewartet, um die Seite nicht zu belasten.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Die Suche greift auf den Vereinsnamen zu, nicht auf den Ort. Deshalb fragen
// wir zusätzlich alle Ortsteile ab – viele Vereine heißen nach ihrem Stadtteil.
const SUCHBEGRIFFE = [
  'Moers', 'Repelen', 'Kapellen', 'Scherpenberg', 'Meerbeck', 'Rheinkamp', 'Asberg',
  'Schwafheim', 'Hochstrass', 'Eick', 'Utfort',
  'Kamp-Lintfort', 'Lintfort', 'Kamp', 'Hoerstgen', 'Hörstgen', 'Saalhoff', 'Niersenbruch',
  'Neukirchen-Vluyn', 'Neukirchen', 'Vluyn', 'Rayen',
  'Rheinberg', 'Budberg', 'Orsoy', 'Borth', 'Ossenberg', 'Millingen',
  'Rheurdt', 'Schaephuysen', 'Alpen', 'Menzelen', 'Veen', 'Bönninghardt',
  'Xanten', 'Lüttingen', 'Vynen', 'Wardt', 'Issum', 'Sevelen',
  'Duisburg', 'Homberg', 'Baerl', 'Rumeln', 'Kaldenhausen', 'Meiderich', 'Walsum',
];

// Nur Vereine aus diesen Orten werden übernommen.
const ORTE = {
  Moers: 'kern', 'Kamp-Lintfort': 'kern', 'Neukirchen-Vluyn': 'kern',
  Rheinberg: 'umland', Rheurdt: 'umland', Alpen: 'umland', Xanten: 'umland', Issum: 'umland',
  Duisburg: 'duisburg',
};

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
  .replace(/&szlig;/g, 'ß').replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü');

const TREFFER = /<li>\s*<a href="https:\/\/www\.fussball\.de\/verein\/([a-z0-9-]+)\/-\/id\/([A-Z0-9]+)"[\s\S]*?<p class="name">([\s\S]*?)<\/p>[\s\S]*?<p class="sub">([\s\S]*?)<\/p>/g;

const gefunden = new Map();

for (const begriff of SUCHBEGRIFFE) {
  let html;
  try {
    const res = await fetch(`https://www.fussball.de/suche/-/text/${encodeURIComponent(begriff)}`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) { console.error(`${begriff}: HTTP ${res.status}`); continue; }
    html = await res.text();
  } catch (err) {
    console.error(`${begriff}: ${err.message}`);
    continue;
  }

  let m;
  let neu = 0;
  TREFFER.lastIndex = 0;
  while ((m = TREFFER.exec(html)) !== null) {
    const [, slug, id, rohName, rohOrt] = m;
    // fussball.de hat vereinzelt Vereine mit falscher Postleitzahl. Der Verband
    // im Slug ist das verlässlichere Signal.
    if (!slug.endsWith('-niederrhein')) continue;
    const name = decode(rohName.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const sub = decode(rohOrt.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const treffer = sub.match(/^(\d{5})\s+(.+)$/);
    if (!treffer) continue;
    const ort = treffer[2];
    if (!(ort in ORTE)) continue;
    if (gefunden.has(id)) continue;
    gefunden.set(id, { name, ort, zone: ORTE[ort], slug, id });
    neu++;
  }
  console.error(`${begriff.padEnd(18)} ${String(neu).padStart(2)} neu  (gesamt ${gefunden.size})`);
  await new Promise((r) => setTimeout(r, 900));
}

const liste = [...gefunden.values()].sort(
  (a, b) => a.zone.localeCompare(b.zone) || a.ort.localeCompare(b.ort) || a.name.localeCompare(b.name),
);

mkdirSync(join(HERE, 'data'), { recursive: true });
writeFileSync(join(HERE, 'data', 'clubs-fussball.json'), JSON.stringify(liste, null, 2) + '\n', 'utf8');
console.error(`\n${liste.length} Vereine nach scripts/data/clubs-fussball.json geschrieben.`);
