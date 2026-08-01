#!/usr/bin/env bash
# Redeploy after a code change (run as root on the VPS)
set -euo pipefail
APP_DIR="/var/www/nexuraai"
cd "$APP_DIR"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
# generated files (routeTree.gen.ts, lockfile, etc.) are rewritten by the build
# on the server, so discard local changes before pulling.
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd -e .env -e .env.* -e node_modules -e .output -e dist

# `.env` is tracked, so the reset above just clobbered the real keys.
bash "$APP_DIR/deploy/restore-env.sh"

set -a; . "$APP_DIR/.env"; set +a


# Preflight: the AI gateway needs a real OpenRouter key in /var/www/nexuraai/.env
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "!! OPENROUTER_API_KEY is empty in $APP_DIR/.env"
  echo "   Chat/autofix will fail with 'OpenRouter is not configured'."
  echo "   Fix:  nano $APP_DIR/.env   ->   OPENROUTER_API_KEY=sk-or-v1-..."
  echo "   Then: systemctl restart nexuraai"
  exit 1
fi

export NITRO_PRESET=node-server
bun install
bun run build
bash "$APP_DIR/deploy/migrate.sh"
chown -R nexuraai:nexuraai "$APP_DIR"

systemctl restart nexuraai
sleep 2
systemctl --no-pager status nexuraai | head -n 15
curl -sS -o /dev/null -w "local health: %{http_code}\n" http://127.0.0.1:3000/
