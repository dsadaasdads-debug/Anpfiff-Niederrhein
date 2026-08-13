// Zeigt den aktuellen Inhalt von data/feed.json in Kurzform.
//
//   node scripts/debug-bestand.mjs           alles
//   node scripts/debug-bestand.mjs kern      nur eine Zone

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const daten = JSON.parse(readFileSync(join(HERE, '..', 'data', 'feed.json'), 'utf8'));
const filter = process.argv[2];

const artikel = filter ? daten.artikel.filter((a) => a.zone === filter) : daten.artikel;

for (const a of artikel) {
  const schloss = a.paywall === true ? '🔒' : a.paywall === null ? '?' : ' ';
  const tag = a.datum ? a.datum.slice(0, 10) : '——————————';
  console.log(`${schloss} ${tag}  [${a.zone.padEnd(8)}] [${(a.ort ?? '').padEnd(16)}] [${(a.sportart ?? '—').padEnd(14)}] ${a.punkte}`);
  console.log(`   ${a.titel.slice(0, 100)}`);
  if (a.vereine.length) console.log(`   Vereine: ${a.vereine.join(', ')}`);
  console.log(`   ${a.quelleName}  ·  ${a.grund}  ·  ${a.teaser.slice(0, 90)}`);
  console.log();
}

console.log(`${artikel.length} Artikel  (Stand ${daten.aktualisiert})`);
const nachOrt = {};
for (const a of daten.artikel) nachOrt[a.ort] = (nachOrt[a.ort] ?? 0) + 1;
console.log(Object.entries(nachOrt).sort((x, y) => y[1] - x[1]).map(([o, n]) => `${o}:${n}`).join('  '));
