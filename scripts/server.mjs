// Winziger Dateiserver für den Container.
//
//   node scripts/server.mjs [--port 8080] [--wurzel .]
//
// Bewusst ohne Fremdbibliothek – wie der Rest des Projekts. Caddy sitzt davor
// und erledigt HTTPS, Kompression und Zwischenspeicher-Regeln.

import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

function argument(name, vorgabe) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : vorgabe;
}

const PORT = Number(argument('--port', process.env.PORT ?? 8080));
const WURZEL = normalize(argument('--wurzel', join(HERE, '..')));

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** Nur diese Dateien und Verzeichnisse werden ausgeliefert. */
const ERLAUBT = [
  'index.html', 'app.js', 'app.css', 'sw.js', 'manifest.webmanifest',
];
const ERLAUBTE_ORDNER = ['icons', 'data'];

function istErlaubt(pfad) {
  if (ERLAUBT.includes(pfad)) return true;
  const erster = pfad.split('/')[0];
  return ERLAUBTE_ORDNER.includes(erster);
}

const server = createServer(async (anfrage, antwort) => {
  try {
    const url = new URL(anfrage.url, 'http://localhost');
    let pfad = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (pfad === '' || pfad.endsWith('/')) pfad += 'index.html';

    // Kein Ausbrechen aus der Wurzel, und nur die freigegebenen Pfade.
    if (pfad.includes('..') || !istErlaubt(pfad)) {
      // Unbekannte Pfade auf die App zurückführen (die PWA hat keine Unterseiten).
      pfad = 'index.html';
    }

    const datei = join(WURZEL, pfad);
    const info = await fs.stat(datei).catch(() => null);
    if (!info || !info.isFile()) {
      antwort.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      antwort.end('Nicht gefunden');
      return;
    }

    antwort.writeHead(200, {
      'Content-Type': TYPEN[extname(datei).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Last-Modified': info.mtime.toUTCString(),
      // Die Feinheiten regelt Caddy davor; hier nur das Nötigste, damit die
      // Daten nicht versehentlich zwischengespeichert werden.
      'Cache-Control': pfad.startsWith('data/') ? 'no-cache' : 'public, max-age=60',
    });
    createReadStream(datei).pipe(antwort);
  } catch (err) {
    antwort.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    antwort.end('Fehler');
    console.error('Anfrage fehlgeschlagen:', err.message);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dateiserver auf Port ${PORT}, Wurzel ${WURZEL}`);
});
