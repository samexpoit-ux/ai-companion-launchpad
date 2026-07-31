#!/usr/bin/env bash
# ============================================================================
# Nexura AI — one-command deploy.
#
#   bun run ship            # from your machine (or: bash deploy/ship.sh)
#
# Does everything, in order, and stops at the first failure:
#   1. local checks   — typecheck + unit tests (skip with --skip-tests)
#   2. sync           — rsync the source tree to the VPS (never touches .env)
#   3. build          — bun install + production build ON the server, so the
#                       VITE_* values baked into the bundle are the server's
#   4. migrate        — apply every new supabase/migrations/*.sql to self-hosted
#                       Supabase, tracked in public.schema_migrations
#   5. restart        — systemd app service + nginx reload + health check
#
# Flags:
#   --skip-tests      skip the local typecheck/test gate
#   --skip-migrations do not touch the database
#   --no-build        sync + migrate + restart only
#   --host / --dir / --service   override the defaults below
# ============================================================================
set -euo pipefail

SSH_HOST="${SSH_HOST:-root@169.58.105.190}"
APP_DIR="${APP_DIR:-/var/www/nexuraai}"
APP_USER="${APP_USER:-nexuraai}"
SERVICE="${SERVICE:-nexuraai}"
HEALTH_URL="${HEALTH_URL:-https://nexuraai.dev}"

RUN_TESTS=1
RUN_MIGRATIONS=1
RUN_BUILD=1

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-tests) RUN_TESTS=0 ;;
    --skip-migrations) RUN_MIGRATIONS=0 ;;
    --no-build) RUN_BUILD=0 ;;
    --host) SSH_HOST="$2"; shift ;;
    --dir) APP_DIR="$2"; shift ;;
    --service) SERVICE="$2"; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '\033[31mfailed: %s\033[0m\n' "$1" >&2; exit 1; }

command -v rsync >/dev/null 2>&1 || die "rsync is required locally (apt install rsync / brew install rsync)"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_HOST" true 2>/dev/null ||
  die "cannot SSH into $SSH_HOST — add your key first (ssh-copy-id $SSH_HOST)"

# ---------------------------------------------------------------- 1. checks --
if [ "$RUN_TESTS" = 1 ]; then
  step "1/5 Local checks (typecheck + unit tests)"
  bun install --frozen-lockfile
  bunx tsgo --noEmit || die "typecheck"
  bun run test || die "unit tests"
else
  step "1/5 Local checks skipped"
fi

# ------------------------------------------------------------------ 2. sync --
step "2/5 Syncing source to $SSH_HOST:$APP_DIR"
ssh "$SSH_HOST" "mkdir -p '$APP_DIR'"
rsync -az --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.output/' \
  --exclude 'dist/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'test-results/' \
  --exclude 'playwright-report/' \
  --exclude '.lovable/' \
  ./ "$SSH_HOST:$APP_DIR/"
echo "synced (server .env left untouched)"

# --------------------------------------------- 3-5. build, migrate, restart --
step "3/5 Remote build · 4/5 migrations · 5/5 restart"
ssh "$SSH_HOST" \
  APP_DIR="$APP_DIR" APP_USER="$APP_USER" SERVICE="$SERVICE" \
  RUN_BUILD="$RUN_BUILD" RUN_MIGRATIONS="$RUN_MIGRATIONS" \
  'bash -s' <<'REMOTE'
set -euo pipefail
export PATH="/root/.bun/bin:/usr/local/bin:$PATH"
cd "$APP_DIR"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

[ -f "$APP_DIR/.env" ] || { echo "missing $APP_DIR/.env — see deploy/README.md"; exit 1; }
set -a; . "$APP_DIR/.env"; set +a

if [ "$RUN_BUILD" = 1 ]; then
  echo "-- installing dependencies"
  bun install
  echo "-- building (NITRO_PRESET=node-server)"
  NITRO_PRESET=node-server bun run build
fi

if [ "$RUN_MIGRATIONS" = 1 ]; then
  echo "-- applying database migrations"
  bash "$APP_DIR/deploy/migrate.sh"
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "-- restarting $SERVICE"
systemctl restart "$SERVICE"
nginx -t >/dev/null && systemctl reload nginx

for i in $(seq 1 30); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)"
  [ "$code" = "200" ] && break
  sleep 1
done
echo "-- local health: ${code:-000}"
[ "${code:-000}" = "200" ] || { systemctl --no-pager status "$SERVICE" | head -n 20; exit 1; }
REMOTE

step "Public health check"
curl -sS -o /dev/null -w "$HEALTH_URL -> %{http_code}\n" "$HEALTH_URL" || true

printf '\n\033[32mDeployed.\033[0m %s is live.\n' "$HEALTH_URL"
