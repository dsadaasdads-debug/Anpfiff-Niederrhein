// Zeigt für jeden Feed-Eintrag, wie die Einstufung entschieden hat.
//
//   node scripts/debug-einstufung.mjs          alle Quellen
//   node scripts/debug-einstufung.mjs rp-      nur Quellen, deren id so beginnt
//
// Legende:  ✔ übernommen   ~ Sport, aber kein Ortsbezug   · kein Sport

import { SOURCES } from './sources.mjs';
import { parseRss } from './lib/rss.mjs';
import { feedLaden } from './lib/artikel.mjs';
import { urlSchluessel, vereineFinden, ortsbezug, istSport } from './lib/einstufung.mjs';

const praefix = process.argv[2] ?? '';
const gesehen = new Set();
const bilanz = { uebernommen: 0, ohneOrt: 0, keinSport: 0 };

for (const quelle of SOURCES.filter((s) => s.id.startsWith(praefix))) {
  console.log(`\n${'='.repeat(78)}\n${quelle.id}  (${quelle.mode})`);
  let eintraege;
  try {
    eintraege = parseRss(await feedLaden(quelle.url));
  } catch (err) {
    console.log(`  FEHLER ${err.message}`);
    continue;
  }

  for (const eintrag of eintraege) {
    const id = urlSchluessel(eintrag.link);
    if (gesehen.has(id)) continue;
    gesehen.add(id);

    const text = `${eintrag.titel} ${eintrag.beschreibung}`;
    const vereine = vereineFinden(text);
    const { sport, grund } = istSport({ eintrag, quelle, vereine });
    const bezug = ortsbezug({ titel: eintrag.titel, teaser: eintrag.beschreibung, url: eintrag.link, vereine });

    if (!sport) { bilanz.keinSport++; continue; }
    if (bezug.zone) bilanz.uebernommen++; else bilanz.ohneOrt++;

    const marke = bezug.zone ? '✔' : '~';
    console.log(`${marke} [${grund.padEnd(14)}] [${(bezug.zone ?? '—').padEnd(8)}] ${eintrag.titel.slice(0, 76)}`);
    console.log(`    ${eintrag.link}`);
    console.log(`    rubriken=${JSON.stringify(eintrag.rubriken)}  vereine=[${vereine.map((v) => v.name).join(', ')}]`);
  }
}

console.log(`\n${'─'.repeat(78)}`);
console.log(`übernommen ${bilanz.uebernommen}   Sport ohne Ortsbezug ${bilanz.ohneOrt}   kein Sport ${bilanz.keinSport}`);
