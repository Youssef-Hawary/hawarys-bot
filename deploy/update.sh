#!/usr/bin/env bash
# Deploy new code: run as root from the project folder on the server.
set -euo pipefail
APP=/opt/hawarys-bot/app
rsync -a --delete --exclude node_modules --exclude 'server/data' --exclude legacy ./ "$APP/"
cd "$APP" && npm run setup && npm run build
chown -R hawary:hawary /opt/hawarys-bot
systemctl restart hawarys-bot
echo "✅ Updated"
