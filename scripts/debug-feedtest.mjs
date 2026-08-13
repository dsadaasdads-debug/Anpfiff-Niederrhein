// Prüft beliebige Feed-Adressen auf Lebenszeichen, bevor man sie in
// sources.mjs aufnimmt. Gewertet wird nur das Datum der Beiträge.
//
//   node scripts/debug-feedtest.mjs <url> [<url> ...]

import { parseRss } from './lib/rss.mjs';
import { feedLaden } from './lib/artikel.mjs';

const TAG = 86_400_000;
const jetzt = Date.now();
const urls = process.argv.slice(2);

if (urls.length === 0) {
  console.error('Bitte mindestens eine Feed-Adresse angeben.');
  process.exit(1);
}

for (const url of urls) {
  const kurz = url.replace(/^https?:\/\/(www\.)?/, '');
  try {
    const eintraege = parseRss(await feedLaden(url));
    const daten = eintraege.map((e) => e.datum?.getTime()).filter(Boolean);
    const alter = daten.length ? Math.round((jetzt - Math.max(...daten)) / TAG) : null;
    const imFenster = daten.filter((d) => d >= jetzt - 30 * TAG).length;
    const marke = imFenster > 0 ? '✔' : '·';
    console.log(`${marke} ${kurz.padEnd(46)} ${String(eintraege.length).padStart(3)} Eintr.  neuester vor ${alter ?? '?'} Tagen  ${imFenster} im Fenster`);
    if (imFenster > 0) {
      for (const e of eintraege.slice(0, 3)) console.log(`      ${e.titel.slice(0, 72)}`);
    }
  } catch (err) {
    console.log(`✗ ${kurz.padEnd(46)} ${err.message.slice(0, 50)}`);
  }
}
