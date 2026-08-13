// Quellen für Anpfiff Niederrhein.
//
// Alle Einträge wurden am 13.08.2026 per HTTP geprüft. Verworfene Kandidaten sind
// unten dokumentiert, damit sie nicht versehentlich noch einmal aufgenommen werden.
//
// mode:
//   'city'  – allgemeiner Stadtfeed, Sportartikel müssen herausgefiltert werden
//   'sport' – reiner Sportfeed, dafür muss der Ortsbezug nachgewiesen werden
//   'club'  – Vereinsfeed, alles darin ist relevant

export const SOURCES = [
  // ── RP Online, Sportressorts ──────────────────────────────────────────────
  // Die eigentliche Fundgrube. RP betreibt gemeinsame Sportredaktionen für
  // mehrere Städte, deshalb liegen Moerser Meldungen teils im Xantener Pfad.
  // Ein Vergleich am 13.08.2026 ergab: moers/sport und xanten/sport teilen
  // 13 von 20 Einträgen, duisburg/sport ist praktisch eigenständig.
  // kamp-lintfort/sport, neukirchen-vluyn/sport und rheinberg/sport existieren
  // zwar, sind aber leer – ihr Sport läuft über moers/sport.
  {
    id: 'rp-sport-moers',
    publisher: 'RP Online',
    name: 'RP Online Sport Moers',
    url: 'https://rp-online.de/nrw/staedte/moers/sport/feed.rss',
    mode: 'city',
  },
  {
    id: 'rp-sport-xanten',
    publisher: 'RP Online',
    name: 'RP Online Sport Xanten und Rheinberg',
    url: 'https://rp-online.de/nrw/staedte/xanten/sport/feed.rss',
    mode: 'city',
  },
  {
    id: 'rp-sport-wesel',
    publisher: 'RP Online',
    name: 'RP Online Sport Wesel',
    url: 'https://rp-online.de/nrw/staedte/wesel/sport/feed.rss',
    mode: 'city',
  },
  {
    id: 'rp-sport-duisburg',
    publisher: 'RP Online',
    name: 'RP Online Sport Duisburg',
    url: 'https://rp-online.de/nrw/staedte/duisburg/sport/feed.rss',
    mode: 'city',
  },
  {
    id: 'rp-fussball',
    publisher: 'RP Online',
    name: 'RP Online Fußball',
    url: 'https://rp-online.de/sport/fussball/feed.rss',
    mode: 'sport',
  },

  // ── RP Online, Stadtseiten ────────────────────────────────────────────────
  // Tragen <category>Sport</category> an Sportartikeln – der zuverlässigste
  // Filter, den wir in der ganzen Region gefunden haben.
  {
    id: 'rp-moers',
    publisher: 'RP Online',
    name: 'RP Online Moers',
    url: 'https://rp-online.de/nrw/staedte/moers/feed.rss',
    mode: 'city',
  },
  {
    id: 'rp-kamp-lintfort',
    publisher: 'RP Online',
    name: 'RP Online Kamp-Lintfort',
    url: 'https://rp-online.de/nrw/staedte/kamp-lintfort/feed.rss',
    mode: 'city',
  },
  {
    id: 'rp-neukirchen-vluyn',
    publisher: 'RP Online',
    name: 'RP Online Neukirchen-Vluyn',
    url: 'https://rp-online.de/nrw/staedte/neukirchen-vluyn/feed.rss',
    mode: 'city',
  },
  {
    id: 'rp-rheinberg',
    publisher: 'RP Online',
    name: 'RP Online Rheinberg',
    url: 'https://rp-online.de/nrw/staedte/rheinberg/feed.rss',
    mode: 'city',
  },
  {
    id: 'rp-xanten',
    publisher: 'RP Online',
    name: 'RP Online Xanten',
    url: 'https://rp-online.de/nrw/staedte/xanten/feed.rss',
    mode: 'city',
  },
  {
    id: 'rp-duisburg',
    publisher: 'RP Online',
    name: 'RP Online Duisburg',
    url: 'https://rp-online.de/nrw/staedte/duisburg/feed.rss',
    mode: 'city',
  },

  // ── Funke: NRZ und WAZ ────────────────────────────────────────────────────
  // Überwiegend Revier- und Landesthemen. Nur mit nachgewiesenem Ortsbezug
  // brauchbar, sonst fluten Schalke, BVB und RWE den Feed.
  {
    id: 'nrz-lokalsport',
    publisher: 'NRZ',
    name: 'NRZ Lokalsport',
    url: 'https://www.nrz.de/sport/lokalsport/rss',
    mode: 'sport',
  },
  {
    id: 'nrz-fussball',
    publisher: 'NRZ',
    name: 'NRZ Fußball',
    url: 'https://www.nrz.de/sport/fussball/rss',
    mode: 'sport',
  },
  {
    id: 'nrz-duisburg',
    publisher: 'NRZ',
    name: 'NRZ Duisburg',
    url: 'https://www.nrz.de/staedte/duisburg/rss',
    mode: 'city',
  },
  {
    id: 'waz-duisburg',
    publisher: 'WAZ',
    name: 'WAZ Duisburg',
    url: 'https://www.waz.de/staedte/duisburg/rss',
    mode: 'city',
  },

  // ── Vereinsfeeds ──────────────────────────────────────────────────────────
  {
    id: 'fuechse-duisburg',
    publisher: 'Füchse Duisburg',
    name: 'Füchse Duisburg',
    url: 'https://www.fuechse-duisburg.de/feed',
    mode: 'club',
    club: 'Füchse Duisburg',
    city: 'Duisburg',
  },
];

// ── Geprüft und verworfen ───────────────────────────────────────────────────
// https://www.fupa.net/rss/…                       410 Gone – FuPa hat RSS abgeschaltet
// https://rp-online.de/sport/fussball/niederrhein/  200, aber leerer Feed (642 Bytes)
// …/kamp-lintfort/sport/feed.rss                    200, aber ohne Einträge
// …/neukirchen-vluyn/sport/feed.rss                 200, aber ohne Einträge
// …/rheinberg/sport/feed.rss                        200, aber ohne Einträge
// https://www.nrz.de/staedte/moers/rss              404 – NRZ hat keine Moers-Stadtsektion
// https://www.extra-tipp-am-sonntag.de/feed         403 – Bot-Sperre
// https://www.lokalklick.eu/feed                    liefert HTML statt Feed
// https://www.lokalkompass.de/rss                   praktisch leer (851 Bytes)
// https://www.1fc-lintfort.de/feed                  404 – Webflow-Seite ohne Feed
// https://www.msv-duisburg.de/feed                  404
