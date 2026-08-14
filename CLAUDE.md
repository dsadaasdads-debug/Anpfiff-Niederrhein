# Anpfiff Niederrhein — Projektstand

Progressive Web App für Lokalsport aus Moers, Kamp-Lintfort und Neukirchen-Vluyn
(Kernzone), dem direkten Umland und gedämpft Duisburg. Regelbasiert, ohne
Sprachmodell und ohne API-Schlüssel.

## Vorgaben des Nutzers (Stand 13.08.2026)
- Reine PWA ohne App Stores
- Alle Sportarten abgedeckt
- Höchste Priorität: 1. FC Lintfort — alles andere im Fußball ist zweitrangig
- Bezahlartikel ab Werk ausgeblendet
- Archiv: 30 Tage
- Push-Benachrichtigungen für eigene Vereine gewünscht
- Moerser SC (Volleyball) und Regattabahn Duisburg ausdrücklich erwünscht
- Nutzung nur privat / im Freundeskreis

## Live-Stand
- Läuft live unter https://dsadaasdads-debug.github.io/Anpfiff-Niederrhein/
- Code unter github.com/dsadaasdads-debug/Anpfiff-Niederrhein
- Zwei GitHub-Actions-Workflows laufen selbstständig: Meldungen stündlich,
  Tabellen alle drei Stunden
- Push aufs Repo funktioniert von diesem Rechner, Zugangsdaten liegen im
  Windows-Anmeldespeicher; `gh` CLI ist NICHT installiert

## Quellen
- Wichtigster Fund: `nrz.de/sport/lokalsport/moers/rss` — ca. 80 tagesaktuelle
  Amateursport-Beiträge, die auf nrz.de selbst nirgends verlinkt sind
- 11 Vereinsfeeds über die auf fussball.de hinterlegten Vereins-Homepages
- Funke-Feeds (nrz.de) tragen den Bezahlstatus als `dcterms:accessRights` mit —
  Bezahlartikel darüber erkennbar und ausblendbar
- FuPa ist als Quelle raus: RSS-Dienst seit einiger Zeit abgeschaltet (410 Gone)
- fussball.de erlaubt Scraping laut robots.txt, Mannschaftsseiten sind
  serverseitig gerendert und dadurch gut auslesbar

## Bekannte Fallstricke
- Bei Feed-Prüfungen zählt nur das Datum der *Beiträge*, nie das des Kanals —
  Jimdo-Feeds setzen den Kanal-Zeitstempel bei jedem Abruf neu (wirkt frisch,
  ist es aber nicht; Beispiel SC Rheinkamp: letzter Beitrag von 2013)
- fussball.de zeigt Ziffern gespielter Ergebnisse als private Unicode-Zeichen
  mit wechselnder Spezialschrift — bewusst nicht umgangen, stattdessen wird zur
  Spielseite verlinkt. Tabellen und Spielpläne stehen im Klartext.
- Beim Ändern der App immer `VERSION` in `sw.js` hochzählen, sonst behalten
  bereits installierte Geräte das alte Gerüst

## Offene Punkte
- Push-Benachrichtigungen über Cloudflare Worker (vom Nutzer gewünscht, noch
  nicht gebaut)
- Regattabahn / Sportpark Duisburg als zusätzliche Quelle
