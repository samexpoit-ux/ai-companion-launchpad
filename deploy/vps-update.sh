#!/usr/bin/env bash
# ============================================================================
# Nexura AI — VPS-এ বসে প্রতিবার চালানোর deploy কমান্ড।
#
#   bash /var/www/nexuraai/deploy/vps-update.sh
#
# যা করে:
#   1. GitHub-এর main-এর সাথে code হুবহু মিলিয়ে নেয় (fetch + reset --hard)
#   2. প্রথমবার হলে বিদ্যমান schema-কে "applied" মার্ক করে (BASELINE=1, SQL চালায় না)
#   3. স্বাভাবিক deploy: bun install → build → migrate → restart → health check
#
# Flags:  --baseline   জোর করে আবার baseline করাও
#         --branch X   main ছাড়া অন্য branch
# ============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexuraai}"
BRANCH="${BRANCH:-main}"
FORCE_BASELINE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --baseline) FORCE_BASELINE=1 ;;
    --branch) BRANCH="$2"; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

cd "$APP_DIR"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

step "1/3 GitHub ($BRANCH) থেকে code sync"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd -e .env -e .env.* -e node_modules -e .output -e dist
echo "now on: $(git rev-parse --short HEAD)"

# migration ledger খালি থাকলে schema আগেই তৈরি ধরে নিয়ে একবার baseline করি,
# তাই "already exists" এররে deploy আটকে যায় না। পরের বার নিজেই skip হবে।
step "2/3 Migration ledger পরীক্ষা"
LEDGER_ROWS=0
SB_DIR="${SB_DIR:-/opt/supabase}"
DB_CONTAINER="$(cd "$SB_DIR" 2>/dev/null && docker compose ps -q db 2>/dev/null || true)"
if [ -n "$DB_CONTAINER" ]; then
  LEDGER_ROWS="$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -qtAX \
    -c "select count(*) from public.schema_migrations;" 2>/dev/null | tr -d '[:space:]' || echo 0)"
fi
if [ "$FORCE_BASELINE" = 1 ] || [ "${LEDGER_ROWS:-0}" = "0" ]; then
  echo "baselining existing schema (কোনো SQL চালানো হবে না)"
  BASELINE=1 bash "$APP_DIR/deploy/migrate.sh"
else
  echo "ledger-এ $LEDGER_ROWS migration আছে — baseline লাগবে না"
fi

step "3/3 Build → migrate → restart"
bash "$APP_DIR/deploy/deploy.sh"

printf '\n\033[32mDone.\033[0m https://nexuraai.dev now runs %s\n' "$(git rev-parse --short HEAD)"
