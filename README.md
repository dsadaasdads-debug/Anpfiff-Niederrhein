# Anpfiff Niederrhein

Installierbare Web-App (PWA) mit Lokalsport aus **Moers, Kamp-Lintfort und
Neukirchen-Vluyn**, dazu das direkte Umland und – bewusst gedämpft – Duisburg.

Keine Fremdbibliotheken, kein Bauschritt, kein Server, keine API-Schlüssel.
Eine GitHub Action sammelt stündlich die Meldungen ein und schreibt sie als
JSON ins Repository; GitHub Pages liefert App und Daten aus.

---

## Was drin steckt

| Datei | Aufgabe |
|---|---|
| `index.html`, `app.css`, `app.js` | die App |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installierbarkeit und Offline-Betrieb |
| `data/feed.json` | die eingesammelten Meldungen (wird automatisch erzeugt) |
| `data/artikel-cache.json` | gemerkte Artikelseiten, damit keine Seite zweimal geholt wird |
| `data/tabellen.json` | Tabellen, Platzierungen und Spielpläne von fussball.de |
| `scripts/tabellen.mjs` | der Tabellen-Sammler |
| `scripts/lib/fussballde.mjs` | das Auslesen von fussball.de |
| `scripts/fetch.mjs` | der Sammler |
| `scripts/sources.mjs` | die Quellen, inklusive der geprüften und verworfenen |
| `scripts/clubs.mjs` | Vereine, Orte, Zonen, Stichwörter |
| `scripts/lib/` | Feed-Parser, Artikelabruf, Einstufung |
| `.github/workflows/aktualisieren.yml` | der stündliche Lauf |

## Einrichtung

Repository: <https://github.com/dsadaasdads-debug/Anpfiff-Niederrhein>
App-Adresse: <https://dsadaasdads-debug.github.io/Anpfiff-Niederrhein/>

**1. Dateien hochladen.** Im Projektordner:

```bash
git push -u origin main
```

**2. Pages einschalten.** Im Repository unter *Settings → Pages*: bei *Source*
„Deploy from a branch“ wählen, Branch `main`, Ordner `/ (root)`, speichern.
Nach ein bis zwei Minuten läuft die App unter der oben genannten Adresse.

**3. Schreibrecht für die Action.** Unter *Settings → Actions → General* ganz
unten bei *Workflow permissions* auf **Read and write permissions** stellen.
Ohne das kann der stündliche Lauf das Ergebnis nicht zurückschreiben.

**4. Ersten Lauf auslösen.** Unter *Actions → Meldungen aktualisieren →
Run workflow*. Danach läuft es stündlich von allein.

Das Repository muss **öffentlich** bleiben: GitHub Pages veröffentlicht auf dem
Gratis-Tarif nur aus öffentlichen Repositories, und nur dort sind die
Action-Minuten unbegrenzt.

## Installieren

**Android:** Adresse in Chrome öffnen, im Menü „App installieren“.

**iPhone/iPad:** Adresse in **Safari** öffnen (nicht Chrome), Teilen-Symbol,
„Zum Home-Bildschirm“. Erst nach diesem Schritt verhält sich die Seite wie eine
App – und erst dann könnte sie später auch Mitteilungen senden.

## Örtlich ausführen

```bash
node scripts/fetch.mjs
```

Danach einen beliebigen Webserver auf den Projektordner richten, zum Beispiel
`npx serve .` — direkt über `file://` funktioniert der Service Worker nicht.

Nützliche Helfer beim Nachjustieren:

```bash
node scripts/debug-einstufung.mjs rp-
```

zeigt für jeden Feed-Eintrag, ob er als Sport erkannt wurde, welcher Ort
zugeordnet wurde und woran das lag.

```bash
node scripts/debug-bestand.mjs kern
```

listet den aktuellen Bestand, wahlweise nur einer Zone.

```bash
node scripts/discover-clubs.mjs
```

erzeugt die Vereinsliste aus der Vereinssuche von fussball.de neu.

## Beim Ändern der App beachten

Wer `index.html`, `app.css`, `app.js` oder `sw.js` anfasst, muss in `sw.js` die
Zeile `const VERSION = 'anpfiff-vN'` hochzählen. Das Gerüst wird zuerst aus dem
Zwischenspeicher bedient — ohne neue Versionsnummer behalten bereits
installierte Geräte den alten Stand, egal was auf dem Server liegt.

## Wie gefiltert wird

Kein Sprachmodell, sondern ein nachvollziehbares Regelwerk. Jeder Artikel trägt
im Datensatz mit, **warum** er aufgenommen wurde (Feld `grund`):

- `rubrik` – RP Online hat den Artikel selbst mit `<category>Sport</category>` versehen
- `pfad` – die Artikeladresse liegt unter `/sport/`
- `sportfeed` – der Feed liefert ausschließlich Sport
- `vereinsfeed` – der Feed gehört einem Verein
- `verein` – ein bekannter Vereinsname plus ein Sportstichwort im Text

Der Ortsbezug wird nach Beweiskraft gewichtet: ein **namentlich genannter
Verein** (Stärke 3) schlägt eine **Ortsnennung im Text** (2), und die schlägt
den **URL-Pfad** (1). Der Pfad wiegt am leichtesten, weil RP Online gemeinsame
Sportredaktionen betreibt – ein Bericht über Sonsbeck liegt deshalb unter
`/staedte/xanten/sport/`. Stammt der Ort nur aus dem Pfad, zeigt die App
absichtlich **keine** Ortsmarke an.

Die Dämpfung Duisburgs ist ein Zeitversatz: Duisburger Meldungen reihen sich
ein, als wären sie 20 Stunden älter, Umland-Meldungen 8 Stunden. Sie
verschwinden also nicht, drängen sich aber nicht vor.

## Bekannte Grenzen

- **Bezahlartikel** sind ab Werk ausgeblendet. RP Online und NRZ stellen einen
  erheblichen Teil des Lokalsports hinter die Schranke – im ersten Durchlauf
  waren es 15 von 43 Meldungen. In den Einstellungen einschaltbar.
- **Kein FuPa.** FuPa hat seinen RSS-Dienst abgeschaltet (alle `/rss/`-Pfade
  antworten mit `410 Gone`).
- **Keine Spielergebnisse.** Tabellen, Platzierungen und Spielpläne kommen
  vollständig von fussball.de. Die *Ziffern gespielter Ergebnisse* liefert
  fussball.de jedoch als private Unicode-Zeichen aus, lesbar nur über eine bei
  jedem Abruf wechselnde Spezialschrift. Das ist eine absichtliche technische
  Sperre, und sie wird hier nicht umgangen — für das Ergebnis führt ein Link zur
  Spielseite. Alles andere (Tabelle, Punkte, Termine, Gegner) steht im Klartext
  da und wird übernommen.
- **Tabellen nur für die Kernstädte.** Abgefragt werden die Vereine aus Moers,
  Kamp-Lintfort und Neukirchen-Vluyn plus einzeln benannte Ausnahmen; die Liste
  steht oben in `scripts/tabellen.mjs`. Alle 59 Vereine abzufragen wäre gegenüber
  fussball.de unhöflich und für den Zweck unnötig.
- **Noch keine Mitteilungen.** Vorgesehen über einen Cloudflare Worker im
  Gratis-Kontingent mit selbst erzeugten VAPID-Schlüsseln.
- **Die Vereinsliste ist nicht vollständig.** Die Vereinssuche von fussball.de
  greift auf den Vereinsnamen zu, nicht auf den Ort – Vereine ohne Ortsnamen im
  Namen fehlen deshalb. Ergänzungen von Hand in `scripts/clubs.mjs` unter
  `WEITERE`.

## Rechtlicher Rahmen

Die App zeigt Schlagzeile, Vorschautext und Vorschaubild und verlinkt zum
Originalartikel bei der jeweiligen Quelle. Volltexte werden weder gespiegelt
noch gespeichert. Der Vorschautext stammt aus dem `og:description`-Feld, das die
Verlage selbst für die Weitergabe an Dritte hinterlegen.

Betrieb ist als private, nicht beworbene Nutzung im Freundeskreis vorgesehen.
Wird die Adresse öffentlich beworben, kommen in Deutschland Impressums- und
Datenschutzpflichten hinzu.
