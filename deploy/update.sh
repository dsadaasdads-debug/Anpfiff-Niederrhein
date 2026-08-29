#!/usr/bin/env bash
# Holt den neuesten Quelltext und aktualisiert die ausgelieferten Dateien.
#
#   sudo bash /opt/anpfiff/quelle/deploy/update.sh

set -euo pipefail
WURZEL="/opt/anpfiff"; QUELLE="$WURZEL/quelle"; APP="$WURZEL/app"

git -C "$QUELLE" fetch --quiet origin
git -C "$QUELLE" reset --hard --quiet origin/main

for f in index.html app.js app.css sw.js manifest.webmanifest; do
  cp -f "$QUELLE/$f" "$APP/$f"
done
rm -rf "$APP/icons" && cp -r "$QUELLE/icons" "$APP/icons"
chown -R anpfiff:anpfiff "$WURZEL"

# Geänderte Zeitgeber übernehmen
cp -f "$QUELLE"/deploy/anpfiff-*.service /etc/systemd/system/
cp -f "$QUELLE"/deploy/anpfiff-*.timer   /etc/systemd/system/
systemctl daemon-reload

echo "Aktualisiert auf $(git -C "$QUELLE" log -1 --format='%h %s')"
