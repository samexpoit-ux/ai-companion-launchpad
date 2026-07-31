#!/usr/bin/env bash
# ============================================================================
# Nexura AI — "git deploy": push local changes to GitHub, then update the VPS
# with EXACTLY that code (pull → install → build → migrations → restart).
#
#   bun run git:deploy                 # commit+push (if needed) then deploy
#   bun run git:deploy -m "my message" # custom commit message
#   bun run git:deploy --no-push       # VPS only: pull whatever is on GitHub
#
# Env overrides: VPS_HOST, VPS_USER, APP_DIR, SERVICE, BRANCH
# ============================================================================
set -euo pipefail

VPS_HOST="${VPS_HOST:-169.58.105.190}"
VPS_USER="${VPS_USER:-root}"
APP_DIR="${APP_DIR:-/var/www/nexuraai}"
SERVICE="${SERVICE:-nexuraai}"
BRANCH="${BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-https://nexuraai.dev}"

DO_PUSH=1
MSG="deploy: $(date -u '+%Y-%m-%d %H:%M UTC')"

while [ $# -gt 0 ]; do
  case "$1" in
    --no-push) DO_PUSH=0 ;;
    -m|--message) MSG="$2"; shift ;;
    --host) VPS_HOST="$2"; shift ;;
    --branch) BRANCH="$2"; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die()  { printf '\033[31mfailed: %s\033[0m\n' "$1" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ------------------------------------------------------- 1. push to GitHub --
if [ "$DO_PUSH" = 1 ]; then
  step "1/3 Pushing your changes to GitHub ($BRANCH)"
  git rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository"

  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "$MSG"
    echo "committed: $MSG"
  else
    echo "no local file changes — pushing existing commits"
  fi

  git push origin "HEAD:$BRANCH" || die "git push (pull --rebase first if it was rejected)"
else
  step "1/3 Push skipped (--no-push) — deploying whatever is on GitHub"
fi

LOCAL_SHA="$(git rev-parse HEAD)"
echo "local HEAD: ${LOCAL_SHA:0:8}"

# --------------------------------------- 2. VPS: pull that exact code + build --
step "2/3 Updating the VPS from GitHub and rebuilding"
ssh -o BatchMode=yes "$VPS_USER@$VPS_HOST" \
  APP_DIR="$APP_DIR" SERVICE="$SERVICE" BRANCH="$BRANCH" \
  'bash -s' <<'REMOTE'
set -euo pipefail
export PATH="/root/.bun/bin:/usr/local/bin:$PATH"
cd "$APP_DIR"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

# generated files (routeTree.gen.ts, lockfile) are rebuilt — never let them block
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd -e .env -e .env.* -e node_modules -e .output -e dist

[ -f "$APP_DIR/.env" ] || { echo "missing $APP_DIR/.env — see deploy/README.md"; exit 1; }
set -a; . "$APP_DIR/.env"; set +a

bun install
NITRO_PRESET=node-server bun run build
bash "$APP_DIR/deploy/migrate.sh"
chown -R nexuraai:nexuraai "$APP_DIR" 2>/dev/null || true

systemctl restart "$SERVICE"
nginx -t >/dev/null && systemctl reload nginx

for i in $(seq 1 30); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)"
  [ "$code" = "200" ] && break
  sleep 1
done
echo "deployed commit: $(git rev-parse --short HEAD)"
echo "local health: ${code:-000}"
[ "${code:-000}" = "200" ] || { systemctl --no-pager status "$SERVICE" | head -n 20; exit 1; }
REMOTE

# ------------------------------------------------------------- 3. verify --
step "3/3 Public health check"
curl -sS -o /dev/null -w "$HEALTH_URL -> %{http_code}\n" "$HEALTH_URL" || true

printf '\n\033[32mDeployed.\033[0m %s now runs %s\n' "$HEALTH_URL" "${LOCAL_SHA:0:8}"
