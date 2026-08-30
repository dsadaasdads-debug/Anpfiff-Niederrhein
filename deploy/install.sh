#!/usr/bin/env bash
# Richtet Anpfiff Niederrhein auf dem Server ein – als Container neben den
# vorhandenen Diensten. Vorhandenes wird nicht angefasst.
#
#   sudo bash install.sh

set -euo pipefail

REPO="https://github.com/dsadaasdads-debug/Anpfiff-Niederrhein.git"
WURZEL="/opt/dienste/anpfiff"
QUELLE="$WURZEL/quelle"

hinweis() { printf '\n\033[1;32m==>\033[0m %s\n' "$1"; }
[ "$(id -u)" -eq 0 ] || { echo "Bitte mit sudo starten."; exit 1; }

hinweis "Quelltext nach $QUELLE holen"
mkdir -p "$WURZEL"
if [ -d "$QUELLE/.git" ]; then
  git -C "$QUELLE" fetch --quiet origin && git -C "$QUELLE" reset --hard --quiet origin/main
else
  git clone --quiet "$REPO" "$QUELLE"
fi
cp -f "$QUELLE/deploy/docker-compose.yml" "$WURZEL/docker-compose.yml"

hinweis "Netzwerk von Caddy prüfen"
docker network inspect web >/dev/null 2>&1 \
  || { echo "Netzwerk web fehlt – bitte den Namen in docker-compose.yml anpassen."; exit 1; }

hinweis "Container bauen und starten"
cd "$WURZEL"
docker compose up -d --build

hinweis "Warten, bis der Dateiserver antwortet"
for i in $(seq 1 30); do
  if docker exec anpfiff wget -qO- http://127.0.0.1:8080/index.html >/dev/null 2>&1; then
    echo "Dateiserver antwortet."; break
  fi
  sleep 2
done

hinweis "Fertig"
cat <<TEXT

Noch von Hand:

  1. DNS-Eintrag anlegen:
       anpfiff.rubenmaurer.de  A     159.195.114.166
                               AAAA  2a0a:4cc0:61:f7b:24f9:17ff:fea4:d1a7

  2. Caddy-Baustein aus quelle/deploy/Caddyfile.block in
     /opt/dienste/caddy/Caddyfile einfügen, dann:
       sudo docker exec caddy caddy reload --config /etc/caddy/Caddyfile

Zustand prüfen:
  sudo docker logs -f anpfiff
  sudo docker exec anpfiff ls -la /app/data
TEXT
