// Dauerbetrieb: Dateiserver plus die drei Sammler in einem Prozess.
//
//   node scripts/dienst.mjs
//
// Ersetzt auf dem eigenen Server die GitHub-Workflows. Die Takte sind deutlich
// enger, weil hier niemand drosselt:
//
//   Meldungen   alle 15 Minuten   (auf GitHub: stündlich)
//   Tabellen    alle 30 Minuten   (auf GitHub: alle drei Stunden)
//   Spieltag    alle  2 Minuten   (auf GitHub: real etwa stündlich)
//
// Der Spieltags-Sammler prüft selbst, ob ein Abruf lohnt, und beendet sich
// sonst ohne Netzzugriff – ein Zwei-Minuten-Takt belastet die Quellen also
// nur während der Spiele.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const AUFGABEN = [
  { name: 'Meldungen', skript: 'fetch.mjs', minuten: 15, sofort: 0 },
  { name: 'Tabellen', skript: 'tabellen.mjs', minuten: 30, sofort: 45 },
  { name: 'Spieltag', skript: 'live.mjs', minuten: 2, sofort: 20 },
];

const zeit = () => new Date().toTimeString().slice(0, 8);
const log = (...a) => console.log(`[${zeit()}]`, ...a);

/** Führt ein Sammelskript als eigenen Prozess aus. */
function starten(aufgabe) {
  return new Promise((fertig) => {
    const begonnen = Date.now();
    const kind = spawn(process.execPath, [join(HERE, aufgabe.skript)], {
      cwd: join(HERE, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let letzteZeile = '';
    kind.stdout.on('data', (d) => {
      const zeilen = String(d).split('\n').filter((z) => z.trim());
      if (zeilen.length) letzteZeile = zeilen.at(-1).trim();
    });
    kind.stderr.on('data', (d) => process.stderr.write(`[${aufgabe.name}] ${d}`));

    // Ein hängender Abruf darf den Takt nicht blockieren.
    const notbremse = setTimeout(() => {
      log(`${aufgabe.name}: Zeitüberschreitung, wird abgebrochen`);
      kind.kill('SIGKILL');
    }, Math.max(aufgabe.minuten * 60_000 * 0.9, 60_000));

    kind.on('close', (code) => {
      clearTimeout(notbremse);
      const dauer = Math.round((Date.now() - begonnen) / 1000);
      log(`${aufgabe.name}: ${code === 0 ? 'ok' : `Ende ${code}`} nach ${dauer}s — ${letzteZeile.slice(0, 110)}`);
      fertig();
    });
  });
}

/** Startet eine Aufgabe erstmalig und danach im festen Takt. */
async function takten(aufgabe) {
  if (aufgabe.sofort > 0) await new Promise((r) => setTimeout(r, aufgabe.sofort * 1000));
  for (;;) {
    try { await starten(aufgabe); } catch (err) { log(`${aufgabe.name}: ${err.message}`); }
    await new Promise((r) => setTimeout(r, aufgabe.minuten * 60_000));
  }
}

log('Anpfiff-Dienst startet');
for (const a of AUFGABEN) log(`  ${a.name.padEnd(11)} alle ${a.minuten} Minuten`);

// Der Dateiserver läuft im selben Prozessbaum.
const server = spawn(process.execPath, [join(HERE, 'server.mjs')], { stdio: 'inherit' });
server.on('close', (code) => {
  log(`Dateiserver beendet (${code}) – Dienst wird beendet, damit Docker neu startet.`);
  process.exit(1);
});

for (const a of AUFGABEN) takten(a);

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => { log(`${signal} empfangen, beende`); server.kill(); process.exit(0); });
}
