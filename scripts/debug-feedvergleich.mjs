// Vergleicht mehrere Feeds auf Überschneidung. Hilft zu erkennen, ob eine
// vermeintlich stadtbezogene Adresse in Wahrheit denselben Regionalfeed liefert.
//
//   node scripts/debug-feedvergleich.mjs <url> <url> ...

import { parseRss } from './lib/rss.mjs';
import { feedLaden } from './lib/artikel.mjs';
import { urlSchluessel } from './lib/einstufung.mjs';

const urls = process.argv.slice(2);
if (urls.length < 2) {
  console.error('Bitte mindestens zwei Feed-Adressen angeben.');
  process.exit(1);
}

const feeds = [];
for (const url of urls) {
  try {
    const eintraege = parseRss(await feedLaden(url));
    feeds.push({ url, ids: new Set(eintraege.map((e) => urlSchluessel(e.link))), eintraege });
    console.log(`${eintraege.length.toString().padStart(3)} Einträge  ${url}`);
  } catch (err) {
    console.log(`FEHLER ${url}: ${err.message}`);
  }
}

console.log('\nÜberschneidung (Anteil der Zeile, der auch in der Spalte steht):');
const kurz = (u) => u.replace('https://rp-online.de/nrw/staedte/', '').replace('/feed.rss', '');
process.stdout.write(''.padEnd(30));
for (const f of feeds) process.stdout.write(kurz(f.url).slice(0, 14).padEnd(16));
console.log();
for (const a of feeds) {
  process.stdout.write(kurz(a.url).slice(0, 28).padEnd(30));
  for (const b of feeds) {
    const gemeinsam = [...a.ids].filter((id) => b.ids.has(id)).length;
    process.stdout.write(`${gemeinsam}/${a.ids.size}`.padEnd(16));
  }
  console.log();
}

console.log('\nNur im ersten Feed enthalten:');
const rest = feeds.slice(1);
for (const e of feeds[0].eintraege) {
  const id = urlSchluessel(e.link);
  if (!rest.some((f) => f.ids.has(id))) console.log(`   ${e.titel.slice(0, 90)}`);
}
