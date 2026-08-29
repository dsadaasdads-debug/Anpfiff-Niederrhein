#!/usr/bin/env bash
# Richtet Anpfiff Niederrhein auf einem Debian-Server ein.
#
#   sudo bash install.sh
#
# Danach laufen drei Zeitgeber: Meldungen alle 15 Minuten, Tabellen alle 30,
# Spieltag alle 2. Ausgeliefert wird von Caddy aus /opt/anpfiff/app.

set -euo pipefail

REPO="https://github.com/dsadaasdads-debug/Anpfiff-Niederrhein.git"
WURZEL="/opt/anpfiff"
QUELLE="$WURZEL/quelle"
APP="$WURZEL/app"
BENUTZER="anpfiff"

hinweis() { printf '\n\033[1;32m==>\033[0m %s\n' "$1"; }

[ "$(id -u)" -eq 0 ] || { echo "Bitte mit sudo starten."; exit 1; }

hinweis "Node.js prüfen"
if ! command -v node >/dev/null; then
  echo "Node.js fehlt – wird installiert."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node --version

hinweis "Dienstbenutzer $BENUTZER anlegen"
id -u "$BENUTZER" >/dev/null 2>&1 || useradd --system --home "$WURZEL" --shell /usr/sbin/nologin "$BENUTZER"

hinweis "Quelltext nach $QUELLE holen"
mkdir -p "$WURZEL"
if [ -d "$QUELLE/.git" ]; then
  git -C "$QUELLE" fetch --quiet origin && git -C "$QUELLE" reset --hard --quiet origin/main
else
  git clone --quiet "$REPO" "$QUELLE"
fi

hinweis "Auslieferungsverzeichnis $APP aufbauen"
mkdir -p "$APP"
# Nur die Dateien, die der Browser braucht – nicht scripts/ und nicht .git.
for f in index.html app.js app.css sw.js manifest.webmanifest; do
  cp -f "$QUELLE/$f" "$APP/$f"
done
rm -rf "$APP/icons" && cp -r "$QUELLE/icons" "$APP/icons"

# Die Daten schreibt der Sammler nach quelle/data; die App liest sie unter
# app/data. Ein Verweis spart das Kopieren im Minutentakt.
mkdir -p "$QUELLE/data"
[ -L "$APP/data" ] || { rm -rf "$APP/data"; ln -s "$QUELLE/data" "$APP/data"; }

chown -R "$BENUTZER":"$BENUTZER" "$WURZEL"

hinweis "Zeitgeber einrichten"
cp -f "$QUELLE"/deploy/anpfiff-*.service /etc/systemd/system/
cp -f "$QUELLE"/deploy/anpfiff-*.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now anpfiff-meldungen.timer anpfiff-tabellen.timer anpfiff-spieltag.timer

hinweis "Erster Durchlauf (kann ein paar Minuten dauern)"
systemctl start anpfiff-meldungen.service || true
systemctl start anpfiff-tabellen.service  || true

hinweis "Fertig"
cat <<TEXT

Noch von Hand zu erledigen:

  1. Caddy-Baustein einbinden:
       import /opt/anpfiff/deploy/Caddyfile.anpfiff
     in /etc/caddy/Caddyfile ergänzen, dann:
       systemctl reload caddy

  2. DNS: anpfiff.rubenmaurer.de auf diesen Server zeigen lassen.

Zustand prüfen:
  systemctl list-timers 'anpfiff-*'
  journalctl -u anpfiff-spieltag.service -n 30 --no-pager
TEXT
