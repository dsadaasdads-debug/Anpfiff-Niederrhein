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

  // ── Funke: NRZ ────────────────────────────────────────────────────────────
  // Der Moerser Lokalsport-Feed ist die ergiebigste Quelle überhaupt: 80
  // tagesaktuelle Beiträge, ausschließlich Amateursport aus dem Altkreis Moers.
  // Er ist auf nrz.de nirgends verlinkt – die Adresse ergibt sich aus dem
  // Pfadmuster der Artikel. Zusätzlich liefern die Funke-Feeds den Bezahlstatus
  // per <dcterms:accessRights> gleich mit, was den Abruf der Artikelseite spart.
  {
    id: 'nrz-lokalsport-moers',
    publisher: 'NRZ',
    name: 'NRZ Lokalsport Moers',
    url: 'https://www.nrz.de/sport/lokalsport/moers/rss',
    mode: 'city',
  },
  {
    id: 'nrz-lokalsport-duisburg',
    publisher: 'NRZ',
    name: 'NRZ Lokalsport Duisburg',
    url: 'https://www.nrz.de/sport/lokalsport/duisburg/rss',
    mode: 'city',
  },
  {
    id: 'nrz-lokalsport',
    publisher: 'NRZ',
    name: 'NRZ Lokalsport',
    url: 'https://www.nrz.de/sport/lokalsport/rss',
    mode: 'sport',
  },

  // ── Vereinsfeeds ──────────────────────────────────────────────────────────
  // Die einzige Quellengattung ganz ohne Bezahlschranke. Ermittelt, indem für
  // jeden Verein die auf fussball.de hinterlegte Homepage geholt und dort nach
  // einem Feed gesucht wurde. Nur aufgenommen, was am 13.08.2026 tatsächlich
  // Einträge lieferte; tote Feeds (TV Asberg, letzter Beitrag 2021) und
  // eingeschlafene (SV Orsoy, Oktober 2025) blieben draußen.
  {
    id: 'moerser-sc',
    publisher: 'Moerser SC',
    name: 'Moerser SC',
    url: 'https://moerser-sportclub.de/feed/',
    mode: 'club', club: 'Moerser SC', ort: 'Moers', zone: 'kern',
  },
  {
    id: 'gsv-moers',
    publisher: 'Grafschafter SV Moers',
    name: 'Grafschafter SV 1910 Moers',
    url: 'https://www.gsv-moers.de/feed/',
    mode: 'club', club: 'Grafschafter SV 1910 Moers', ort: 'Moers', zone: 'kern',
  },
  {
    id: 'vfl-repelen',
    publisher: 'VfL Repelen',
    name: 'VfL Repelen 08',
    url: 'https://www.vfl-repelen.de/index.php?format=feed&type=rss',
    mode: 'club', club: 'VFL Repelen 08', ort: 'Moers', zone: 'kern',
  },
  {
    id: 'msv-moers',
    publisher: 'Meerbecker SV Moers',
    name: 'Meerbecker SV Moers 13/20',
    url: 'https://www.msv-moers.de/?format=feed&type=rss',
    mode: 'club', club: 'Meerbecker SV Moers 13/20', ort: 'Moers', zone: 'kern',
  },
  {
    id: 'fc-neukirchen-vluyn',
    publisher: 'FC Neukirchen-Vluyn',
    name: 'FC Neukirchen-Vluyn',
    url: 'https://fc-nv.de/feed/',
    mode: 'club', club: 'FC Neukirchen-Vluyn', ort: 'Neukirchen-Vluyn', zone: 'kern',
  },
  {
    id: 'borussia-veen',
    publisher: 'SV Borussia Veen',
    name: 'SV Borussia Veen 1920',
    url: 'https://www.borussia-veen.de/blog-feed.xml',
    mode: 'club', club: 'SV Borussia Veen 1920', ort: 'Alpen', zone: 'umland',
  },
  {
    id: 'sv-menzelen',
    publisher: 'SV Menzelen',
    name: 'SV Menzelen 1925',
    url: 'https://sv-menzelen1925.de/feed/',
    mode: 'club', club: 'SV Menzelen 1925', ort: 'Alpen', zone: 'umland',
  },
  {
    id: 'viktoria-alpen',
    publisher: 'FC Viktoria Alpen',
    name: 'FC Viktoria Alpen 1911',
    url: 'https://www.viktoria-alpen.de/feed/',
    mode: 'club', club: 'FC Viktoria Alpen 1911', ort: 'Alpen', zone: 'umland',
  },
  {
    id: 'spvgg-rheurdt',
    publisher: 'SpVgg Rheurdt-Schaephuysen',
    name: 'SpVgg. Rheurdt-Schaephuysen',
    url: 'https://spvgg-rheurdt-schaephuysen.de/feed/',
    mode: 'club', club: 'SpVgg. Rheurdt-Schaephuysen', ort: 'Rheurdt', zone: 'umland',
  },
  {
    id: 'tus-borth',
    publisher: 'TuS Borth',
    name: 'TuS Borth 71',
    url: 'https://tusborth.de/feed/',
    mode: 'club', club: 'TuS Borth 71', ort: 'Rheinberg', zone: 'umland',
  },
  {
    id: 'sv-sevelen',
    publisher: 'SV Sevelen',
    name: 'SV Sevelen 1919',
    url: 'https://sv-sevelen.de/feed/',
    mode: 'club', club: 'SV Sevelen 1919', ort: 'Issum', zone: 'umland',
  },
  {
    id: 'fuechse-duisburg',
    publisher: 'Füchse Duisburg',
    name: 'Füchse Duisburg',
    url: 'https://www.fuechse-duisburg.de/feed',
    mode: 'club', club: 'Füchse Duisburg', ort: 'Duisburg', zone: 'duisburg',
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
// https://www.1fc-lintfort.de/feed                  404 – Webflow-Seite ohne Feed,
//     auch /blog/rss.xml, /news/rss.xml, /rss.xml und /aktuelles/rss.xml sind 404.
//     Ausgerechnet der wichtigste Verein hat keinen. Nur über RP erreichbar.
// https://www.msv-duisburg.de/feed                  404
// https://www.svbfussball.de/rss.php                HTTP 500 (SV Budberg)
// http://susrayen.de/feed                           Feed ohne Einträge
// http://exitus-esters.de/feed                      Feed ohne Einträge
// https://ssv-luettingen.de/feed/                   Feed ohne Einträge
// https://www.tv-asberg.de/…format=feed             letzter Beitrag 2021 – tot
// https://sv-orsoy.de/feed/                         letzter Beitrag Oktober 2025 – eingeschlafen
//
// https://www.sc-rheinkamp.de/rss/blog             Jimdo-Feed, letzter Beitrag 2013.
//     Achtung: der Kanal-Zeitstempel wird bei jedem Abruf neu gesetzt, der Feed
//     wirkt dadurch taufrisch. Nur das Datum der Beiträge zählt.
// https://www.nrz.de/staedte/duisburg/rss           verwaist, Beiträge von Juni 2024
// https://www.waz.de/staedte/duisburg/rss           verwaist, Beiträge von Juni 2024
// https://www.nrz.de/sport/fussball/rss             verwaist, Beiträge von Juni 2024
// https://www.nrz.de/region/niederrhein/rss         verwaist, Beiträge von Juni 2024
// https://www.waz.de/sport/lokalsport/duisburg/rss  inhaltsgleich mit dem NRZ-Feed
//
// Ohne Feed, nur per HTML-Auslesen erreichbar (bislang nicht umgesetzt):
// https://www.radiokw.de/nachrichten                Lokalradio Kreis Wesel, werbefinanziert
// https://www.fvn.de/                               Fußballverband Niederrhein
// https://www.niederrhein-nachrichten.de/           kostenloses Anzeigenblatt
