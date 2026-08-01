#!/usr/bin/env bash
# Write /var/www/nexuraai/.env in one command (run as root on the VPS).
#
#   bash /var/www/nexuraai/deploy/set-env.sh sk-or-v1-YOURKEY
#
# Supabase keys are read automatically from the self-hosted stack
# (/opt/supabase/.env). The OpenRouter key is optional: leave it out and the
# existing value in .env is kept.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexuraai}"
SUPABASE_DIR="${SUPABASE_DIR:-/opt/supabase}"
ENV_FILE="$APP_DIR/.env"
SUPABASE_PUBLIC_URL="${SUPABASE_PUBLIC_URL:-https://supabase.nexuraai.dev}"
PROJECT_ID="${PROJECT_ID:-nexura}"

read_var() { # read_var FILE NAME
  [ -f "$1" ] || return 0
  sed -n "s/^[[:space:]]*$2=//p" "$1" | tail -n 1 | tr -d '"'"'"'\r'
}

# 1) OpenRouter key: CLI arg > env var > current .env value
OPENROUTER_KEY="${1:-${OPENROUTER_API_KEY:-}}"
[ -n "$OPENROUTER_KEY" ] || OPENROUTER_KEY="$(read_var "$ENV_FILE" OPENROUTER_API_KEY)"

# 2) Supabase keys from the self-hosted stack, falling back to current .env
ANON_KEY="$(read_var "$SUPABASE_DIR/.env" ANON_KEY)"
SERVICE_KEY="$(read_var "$SUPABASE_DIR/.env" SERVICE_ROLE_KEY)"
[ -n "$ANON_KEY" ] || ANON_KEY="$(read_var "$ENV_FILE" SUPABASE_PUBLISHABLE_KEY)"
[ -n "$SERVICE_KEY" ] || SERVICE_KEY="$(read_var "$ENV_FILE" SUPABASE_SERVICE_ROLE_KEY)"

fail=0
[ -n "$ANON_KEY" ]    || { echo "!! ANON_KEY not found in $SUPABASE_DIR/.env"; fail=1; }
[ -n "$SERVICE_KEY" ] || { echo "!! SERVICE_ROLE_KEY not found in $SUPABASE_DIR/.env"; fail=1; }
[ -n "$OPENROUTER_KEY" ] || { echo "!! OpenRouter key missing: pass it as the first argument"; fail=1; }
[ "$fail" = 0 ] || exit 1

mkdir -p "$APP_DIR"
[ -f "$ENV_FILE" ] && cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"

umask 077
cat > "$ENV_FILE" <<EOF
# Nexura AI — written by deploy/set-env.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
NODE_ENV=production
PORT=3000

VITE_SUPABASE_URL=$SUPABASE_PUBLIC_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=$PROJECT_ID

SUPABASE_URL=$SUPABASE_PUBLIC_URL
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY

OPENROUTER_API_KEY=$OPENROUTER_KEY
EOF

chown nexuraai:nexuraai "$ENV_FILE" 2>/dev/null || true
chmod 600 "$ENV_FILE"

echo "wrote $ENV_FILE"
awk -F= '{ if (length($2) > 12) printf "  %s=%s…%s (%d chars)\n", $1, substr($2,1,8), substr($2,length($2)-3), length($2); else if ($0 ~ /=/) print "  " $0 }' "$ENV_FILE"

if systemctl list-unit-files | grep -q '^nexuraai.service'; then
  systemctl restart nexuraai
  sleep 2
  curl -sS -o /dev/null -w "local health: %{http_code}\n" http://127.0.0.1:3000/ || true
fi
