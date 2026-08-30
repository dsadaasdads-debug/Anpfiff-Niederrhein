#!/usr/bin/env bash
# Holt den neuesten Quelltext und baut den Container neu.
#   sudo bash /opt/dienste/anpfiff/quelle/deploy/update.sh
set -euo pipefail
WURZEL="/opt/dienste/anpfiff"; QUELLE="$WURZEL/quelle"

git -C "$QUELLE" fetch --quiet origin
git -C "$QUELLE" reset --hard --quiet origin/main
cp -f "$QUELLE/deploy/docker-compose.yml" "$WURZEL/docker-compose.yml"

cd "$WURZEL"
docker compose up -d --build
echo "Aktualisiert auf $(git -C "$QUELLE" log -1 --format='%h %s')"
