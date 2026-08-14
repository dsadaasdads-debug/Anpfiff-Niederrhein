/* Service Worker: macht die App installierbar und offline lesbar.
   Gerüst wird zwischengespeichert, die Meldungen kommen bevorzugt frisch aus
   dem Netz und fallen bei fehlender Verbindung auf den letzten Stand zurück. */

// WICHTIG: Bei jeder Änderung an index.html, app.css, app.js oder sw.js diese
// Zahl erhöhen. Das Gerüst wird zuerst aus dem Zwischenspeicher bedient –
// ohne neue Version behalten installierte Geräte den alten Stand.
const VERSION = 'anpfiff-v16';
const GERUEST = `${VERSION}-geruest`;
const DATEN = `${VERSION}-daten`;
const BILDER = `${VERSION}-bilder`;

const GRUNDGERUEST = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(GERUEST)
      // cache: 'reload' ist entscheidend. Ohne das holt addAll die Dateien
      // durch den gewöhnlichen Browser-Zwischenspeicher – und legt dann eine
      // veraltete Fassung unter der neuen Version ab. Der Versionswechsel
      // allein bliebe damit wirkungslos.
      .then((c) => c.addAll(GRUNDGERUEST.map((pfad) => new Request(pfad, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(
        namen.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const anfrage = e.request;
  if (anfrage.method !== 'GET') return;

  const url = new URL(anfrage.url);

  // Meldungen und Tabellen: erst das Netz, dann der Zwischenspeicher.
  if (url.origin === self.location.origin && /\/data\/(feed|tabellen|live)\.json$/.test(url.pathname)) {
    e.respondWith(
      fetch(anfrage)
        .then((antwort) => {
          const kopie = antwort.clone();
          caches.open(DATEN).then((c) => c.put(anfrage, kopie));
          return antwort;
        })
        .catch(() => caches.match(anfrage).then((treffer) => treffer ?? Response.error())),
    );
    return;
  }

  // Vorschaubilder liegen bei den Verlagen: zwischenspeichern, aber begrenzt.
  if (anfrage.destination === 'image' && url.origin !== self.location.origin) {
    e.respondWith(
      caches.match(anfrage).then((treffer) => treffer ?? fetch(anfrage).then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(BILDER).then(async (c) => {
            await c.put(anfrage, kopie);
            const schluessel = await c.keys();
            // Ältestes zuerst wegwerfen, damit der Speicher nicht ausufert.
            for (const alt of schluessel.slice(0, Math.max(0, schluessel.length - 150))) c.delete(alt);
          });
        }
        return antwort;
      }).catch(() => Response.error())),
    );
    return;
  }

  // Gerüst: erst der Zwischenspeicher, sonst das Netz.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(anfrage).then((treffer) => treffer ?? fetch(anfrage).then((antwort) => {
        if (antwort.ok && antwort.type === 'basic') {
          const kopie = antwort.clone();
          caches.open(GERUEST).then((c) => c.put(anfrage, kopie));
        }
        return antwort;
      }).catch(() => caches.match('index.html'))),
    );
  }
});
