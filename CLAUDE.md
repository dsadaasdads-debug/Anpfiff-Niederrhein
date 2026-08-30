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
- **Beim Rebase niemals `git checkout --theirs data/` benutzen.** Während eines
  Rebase meint `--theirs` den *eigenen* Commit, nicht den vom Server. Damit
  überschreibt man die Daten, die die Workflows inzwischen geschrieben haben —
  am 14.08.2026 sind so sieben Spieltags-Läufe eines ganzen Abends verlorengegangen.
  Richtig ist `--ours` (der Serverstand) und danach das Skript neu laufen lassen.
- Bei Feed-Prüfungen zählt nur das Datum der *Beiträge*, nie das des Kanals —
  Jimdo-Feeds setzen den Kanal-Zeitstempel bei jedem Abruf neu (wirkt frisch,
  ist es aber nicht; Beispiel SC Rheinkamp: letzter Beitrag von 2013)
- fussball.de zeigt Ziffern gespielter Ergebnisse als private Unicode-Zeichen
  mit wechselnder Spezialschrift — bewusst nicht umgangen, stattdessen wird zur
  Spielseite verlinkt. Tabellen und Spielpläne stehen im Klartext.
- Beim Ändern der App immer `VERSION` in `sw.js` hochzählen, sonst behalten
  bereits installierte Geräte das alte Gerüst

## Spieltag / Ticker
- **Welche Quelle gewinnt, entscheidet sich pro Partie** (`guete()` in
  `live.mjs`), nicht pauschal. FuPa listet auch Partien, die niemand betreut:
  der Eintrag bleibt dann leer, während fussball.de längst ein Ergebnis meldet.
  Bleibt ein FuPa-Eintrag zehn Minuten nach Anpfiff leer, wird gegengeprüft und
  der reichhaltigere Satz genommen; Spielernamen aus dem Verlierer werden nur
  bei **exakt** gleicher Minute und gleichem Zeichen nachgetragen.
- **fussball.de hat fast nie eine Zeitleiste.** In den Kreisligen fehlt
  `data-match-events` regelmäßig — früher gab `spielverlauf()` dann `null`
  zurück und warf auch den Ergebnisvermerk weg. Der Ergebnisblock
  (`class="result"`) steht dagegen immer da und sagt dreierlei: Vermerk im
  Klartext („Ausfall“), zwei verschleierte Ziffern (Ergebnis gemeldet) oder
  nichts. Nur das *Ob* wird ausgewertet, nicht das *Was* — die App verweist
  dann auf die Spielseite. Der Spielstand darf **nicht** aus den
  Tor-Ereignissen gezählt werden, wenn es gar keine gibt: das wäre ein
  vorgetäuschtes 0:0.
- **FuPa ist die erste Quelle** — `api.fupa.net/v1`, offen, ohne Schlüssel.
  Entscheidend: dort stehen **Spielernamen im Klartext**. Der Ticker steckt im
  Feld `highlights` des Spielobjekts (`/matches/{id}`), nicht in einer eigenen
  Route — `/matches/{id}/ticker` und `/goals` sind reine Schreibwege (405 bei GET).
  Aufbau eines Ereignisses: `{minute, additionalMinute, type, subtype, homeGoal,
  awayGoal, primaryRole:{firstName,lastName}, secondaryRole}`.
- Vereine tragen ihr Gebiet selbst mit: `/clubs/{slug}` → `district.slug`.
  Für uns sind das **`moers`** (Kreisligen) und **`niederrhein`** (Bezirks-,
  Landes-, Oberliga). Partien eines Tages: `/districts/{gebiet}/matches?day=JJJJ-MM-TT`.
  Achtung: Mannschaftsnamen liegen dort unter `homeTeam.name.full`, nicht unter
  `homeTeamName` — letzteres gibt es nur im Einzelspiel.
- Die Daten sind von Menschen eingetragen. `flags: ['ticker']` sagt vorab, ob
  überhaupt getickert wird; Minuten fehlen, wenn der Reporter sie nicht erfasst hat.
- **fussball.de dient als Rückfall** für Partien ohne FuPa-Ticker: dort liefert
  das Attribut `data-match-events` Minute und Ereignisart im Klartext, aber die
  Spielernamen sind wie die Ergebnisziffern verschleiert und bleiben leer.
- Dublettenabgleich zwischen beiden Quellen läuft über *eigene Mannschaft +
  Anstoßzeit*, nicht über die Paarung: die Quellen schreiben Gegner
  unterschiedlich („ETB Schwarz-Weiß Essen“ / „ETB SW Essen“) und fussball.de
  hängt Reserven ein „II“ an, das FuPa weglässt.

## Tabellenquellen
- **Fußball:** fussball.de, Kern + Umland, 10 Ligen / 29 Mannschaften
- **Handball:** handball.net, offenes JSON ohne Schlüssel, 7 Spielklassen.
  ACHTUNG: Der Handball-Verband Niederrhein ist 2023/24 in **Handball Nordrhein**
  aufgegangen. Unter der Kennung `Niederrhein` liegen nur tote Daten bis 23/24;
  aktuell ist die Organisation `Nordrhein`, Kreise „Wesel“ und „Rhein-Ruhr“.
  Die alte nuLiga-Instanz `hvniederrhein-handball.liga.nu` endet bei 22/23.
- **Volleyball:** noch nicht gebaut, aber der Weg ist bekannt. Die Tabellen der
  Volleyball-Bundesliga stehen serverseitig gerendert unter
  `/cms/home/<bereich>/statistik/<seite>/tabelle_<seite>.xhtml` (SAMS/PrimeFaces).
  Für die 1. Bundesliga Männer funktioniert das bereits. Die 2. Bundesliga, in
  der der Moerser SC spielt, war am 13.08.2026 noch nicht veröffentlicht —
  **Saisonstart ist der 20.10.2026**. Vorher gibt es nichts zu holen.

## Vereinsfeeds filtern
`VEREINSINTERN_WOERTER` in `clubs.mjs` greift **nur** bei `mode: 'club'` — in
Vereinsfeeds steckt neben Sport auch Verwaltung, Sponsorenwerbung und
Kartenverkauf. Die Prüfung muss an zwei Stellen laufen: beim Einlesen
(`istSport`) **und** in der rückwirkenden Nachbewertung in `fetch.mjs`. Fehlt
die zweite, bleiben Altmeldungen dreißig Tage stehen, obwohl die Regel längst
greift. Die Wortgrenze davor heißt: „Partner“ trifft nicht „Trainingspartner“.

## Offene Punkte
- Push-Benachrichtigungen über Cloudflare Worker (vom Nutzer gewünscht, noch
  nicht gebaut)
- Volleyball-Tabellen ab Ende Oktober 2026 nachziehen (siehe oben)
- Regattabahn / Sportpark Duisburg als zusätzliche Quelle
