#!/usr/bin/env bash
# Redeploy after a code change (run as root on the VPS)
set -euo pipefail
APP_DIR="/var/www/nexura"
cd "$APP_DIR"
git pull --ff-only
set -a; . "$APP_DIR/.env"; set +a
export NITRO_PRESET=node-server
bun install
bun run build
chown -R nexura:nexura "$APP_DIR"
systemctl restart nexura
sleep 2
systemctl --no-pager status nexura | head -n 15
curl -sS -o /dev/null -w "local health: %{http_code}\n" http://127.0.0.1:3000/
