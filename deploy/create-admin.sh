#!/usr/bin/env bash
# Create (or repair) an admin account against whatever Supabase the app uses.
#
#   bash deploy/create-admin.sh samexpoit@gmail.com 'Shovon@5448'
#
# Works in two modes:
#   1. docker mode  — a self-hosted Supabase stack is found on this machine
#                     (also flips ENABLE_EMAIL_AUTOCONFIRM=true)
#   2. http mode    — no local stack; uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
#                     from /etc/nexuraai.env (or ./.env) and the admin REST API
set -euo pipefail

EMAIL="${1:-}"
PASSWORD="${2:-}"
APP_DIR="${APP_DIR:-/var/www/nexuraai}"

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "usage: bash deploy/create-admin.sh <email> <password>" >&2
  exit 1
fi

read_var() { [ -f "$1" ] && grep -E "^$2=" "$1" | tail -n1 | cut -d= -f2- | tr -d '"' || true; }

# ---------- locate a self-hosted stack (optional) ----------
SUPA_DIR=""
for d in ${SUPA_DIR_HINT:-} /opt/supabase/docker /opt/supabase/supabase/docker /root/supabase/docker /opt/supabase; do
  [ -n "$d" ] && [ -f "$d/.env" ] && [ -f "$d/docker-compose.yml" ] && { SUPA_DIR="$d"; break; }
done

if [ -n "$SUPA_DIR" ]; then
  echo "==> docker mode ($SUPA_DIR)"
  cd "$SUPA_DIR"
  SERVICE_KEY="$(read_var .env SERVICE_ROLE_KEY)"
  # always talk to the local gateway — the public hostname may not resolve yet
  KONG_PORT="$(read_var .env KONG_HTTP_PORT)"
  API_URL="${ADMIN_API_URL:-http://127.0.0.1:${KONG_PORT:-8000}}"

  echo "==> [1/3] enable email autoconfirm"
  if grep -q '^ENABLE_EMAIL_AUTOCONFIRM=' .env; then
    sed -i 's|^ENABLE_EMAIL_AUTOCONFIRM=.*|ENABLE_EMAIL_AUTOCONFIRM=true|' .env
  else
    echo 'ENABLE_EMAIL_AUTOCONFIRM=true' >> .env
  fi
  docker compose up -d auth >/dev/null
  sleep 8
else
  echo "==> http mode (no local Supabase stack found)"
  ENV_FILE=/etc/nexuraai.env
  [ -f "$ENV_FILE" ] || ENV_FILE="$APP_DIR/.env"
  API_URL="$(read_var "$ENV_FILE" SUPABASE_URL)"
  [ -n "$API_URL" ] || API_URL="$(read_var "$ENV_FILE" VITE_SUPABASE_URL)"
  SERVICE_KEY="$(read_var "$ENV_FILE" SUPABASE_SERVICE_ROLE_KEY)"
  if [ -z "$API_URL" ] || [ -z "$SERVICE_KEY" ]; then
    echo "!! need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in $ENV_FILE" >&2
    echo "   either run: bash deploy/supabase-selfhost.sh   (installs the local stack)" >&2
    echo "   or add the service role key:  nano $ENV_FILE" >&2
    exit 1
  fi
  API_URL="${API_URL%/}"
fi

api() { # api <method> <path> [json]
  curl -sS -X "$1" "$API_URL$2" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
    -H 'Content-Type: application/json' ${3:+-d "$3"}
}

echo "==> [2/3] create user $EMAIL (email_confirm=true)"
RESP="$(api POST /auth/v1/admin/users "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}")"
echo "$RESP" | head -c 300; echo

USER_ID="$(printf '%s' "$RESP" | sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p' | head -n1)"

if [ -z "$USER_ID" ]; then
  echo "   user exists — looking it up and resetting the password"
  LIST="$(api GET "/auth/v1/admin/users?page=1&per_page=200")"
  USER_ID="$(printf '%s' "$LIST" | tr '{' '\n' | grep -F "\"email\":\"$EMAIL\"" | sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p' | head -n1)"
  if [ -z "$USER_ID" ]; then
    echo "!! could not find user $EMAIL" >&2; exit 1
  fi
  api PUT "/auth/v1/admin/users/$USER_ID" \
    "{\"password\":\"$PASSWORD\",\"email_confirm\":true}" | head -c 200; echo
fi
echo "   user_id = $USER_ID"

echo "==> [3/3] grant admin role"
api POST "/rest/v1/user_roles" "{\"user_id\":\"$USER_ID\",\"role\":\"admin\"}" | head -c 300; echo
api GET "/rest/v1/user_roles?user_id=eq.$USER_ID&select=role" | head -c 300; echo

echo "done — sign in at https://nexuraai.dev/auth then open /admin"
