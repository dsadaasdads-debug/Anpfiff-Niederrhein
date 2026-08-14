// Legt echte FuPa-Ereignisse in data/live.json, um die Spieltagsansicht auch
// dann prüfen zu können, wenn gerade nichts gespielt wird.
//
//   node scripts/debug-live-testdaten.mjs [<fupa-spiel-id>]
//
// Der Stand wird beim nächsten regulären Lauf von scripts/live.mjs überschrieben.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as fupa from './lib/fupa.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ZIEL = join(HERE, '..', 'data', 'live.json');

if (!existsSync(ZIEL)) {
  console.error('data/live.json fehlt – erst scripts/live.mjs laufen lassen.');
  process.exit(1);
}

const spielId = process.argv[2] ?? '15368071';
const daten = JSON.parse(readFileSync(ZIEL, 'utf8'));
if (!daten.partien?.length) {
  console.error('Keine Partien in data/live.json – heute spielt niemand.');
  process.exit(1);
}

const verlauf = await fupa.spielverlauf(spielId);

const erste = daten.partien[0];
erste.ereignisse = verlauf.ereignisse;
erste.tore = verlauf.tore;
erste.zuschauer = verlauf.zuschauer ?? 120;
erste.schiedsrichter = verlauf.schiedsrichter ?? 'Max Beispiel';
erste.quelle = 'FuPa';
erste.laeuft = true;
erste.abgeschlossen = false;
erste.anpfiff = new Date(Date.now() - 40 * 60_000).toISOString();

writeFileSync(ZIEL, JSON.stringify(daten, null, 1) + '\n', 'utf8');
console.log(`${verlauf.ereignisse.length} Ereignisse aus Spiel ${spielId} in „${erste.heim} – ${erste.gast}“ gelegt.`);
console.log(`davon mit Spielername: ${verlauf.ereignisse.filter((e) => e.spieler).length}`);
