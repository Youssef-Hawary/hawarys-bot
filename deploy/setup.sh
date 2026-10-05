#!/usr/bin/env bash
# One-time server setup for Ubuntu 24.04. Run as root from the project folder:
#   bash deploy/setup.sh bot.hawarystore.com
set -euo pipefail
DOMAIN="${1:?Usage: bash deploy/setup.sh your.domain.com}"
APP=/opt/hawarys-bot/app

echo "==> Installing Node.js 24, Caddy, firewall"
apt-get update
apt-get install -y curl ca-certificates gnupg python3 ufw debian-keyring debian-archive-keyring apt-transport-https rsync
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

echo "==> Copying the app to $APP"
id hawary &>/dev/null || useradd --system --create-home --home-dir /opt/hawarys-bot --shell /usr/sbin/nologin hawary
mkdir -p "$APP"
rsync -a --delete --exclude node_modules --exclude 'server/data' --exclude legacy ./ "$APP/"
mkdir -p "$APP/server/data"
cd "$APP" && npm run setup && npm run build
chown -R hawary:hawary /opt/hawarys-bot

echo "==> Service, HTTPS, backups"
cp deploy/hawarys-bot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now hawarys-bot
printf '%s {\n  encode gzip\n  reverse_proxy 127.0.0.1:8787\n}\n' "$DOMAIN" > /etc/caddy/Caddyfile
systemctl reload caddy
echo "15 4 * * * hawary cd $APP/server && /usr/bin/node src/backup.ts >/dev/null 2>&1" > /etc/cron.d/hawarys-bot-backup
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

echo
echo "✅ Done. Open https://$DOMAIN and create the owner account."
