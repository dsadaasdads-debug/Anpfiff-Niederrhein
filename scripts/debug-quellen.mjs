// Prüft alle konfigurierten Quellen auf Lebenszeichen.
//
//   node scripts/debug-quellen.mjs
//
// Wichtig: gewertet wird ausschließlich das Datum der Beiträge, nie das des
// Kanals. Manche Baukästen setzen den Kanal-Zeitstempel bei jedem Abruf neu –
// ein Feed mit Beiträgen von 2013 sieht damit taufrisch aus.

import { SOURCES } from './sources.mjs';
import { parseRss } from './lib/rss.mjs';
import { feedLaden } from './lib/artikel.mjs';

const TAG = 86_400_000;
const jetzt = Date.now();
const zeilen = [];

for (const quelle of SOURCES) {
  try {
    const eintraege = parseRss(await feedLaden(quelle.url));
    const daten = eintraege.map((e) => e.datum?.getTime()).filter(Boolean);
    const neuestes = daten.length ? Math.max(...daten) : null;
    const alterTage = neuestes ? Math.round((jetzt - neuestes) / TAG) : null;
    const imFenster = daten.filter((d) => d >= jetzt - 30 * TAG).length;
    zeilen.push({ id: quelle.id, mode: quelle.mode, n: eintraege.length, alterTage, imFenster });
  } catch (err) {
    zeilen.push({ id: quelle.id, mode: quelle.mode, n: 0, alterTage: null, imFenster: 0, fehler: err.message });
  }
}

zeilen.sort((a, b) => (a.alterTage ?? 99999) - (b.alterTage ?? 99999));

console.log('Quelle                        Modus    Eintr.  neuester Beitrag   in 30 Tagen');
console.log('─'.repeat(80));
for (const z of zeilen) {
  const alter = z.fehler ? 'FEHLER' : z.alterTage === null ? 'ohne Datum' : `vor ${z.alterTage} Tagen`;
  const marke = z.imFenster > 0 ? '✔' : z.alterTage !== null && z.alterTage < 120 ? '~' : '✗';
  console.log(`${marke} ${z.id.padEnd(28)} ${z.mode.padEnd(8)} ${String(z.n).padStart(4)}   ${alter.padEnd(18)} ${String(z.imFenster).padStart(3)}`);
  if (z.fehler) console.log(`    ${z.fehler}`);
}
console.log('\n✔ liefert aktuell   ~ still, aber nicht tot   ✗ tot oder ohne Datum');
