#!/usr/bin/env bash
# Create (or repair) an admin account on the self-hosted Supabase stack.
#
#   bash deploy/create-admin.sh samexpoit@gmail.com 'Shovon@5448'
#
# - creates the auth user with email already confirmed (no mail verification)
# - gives it the `admin` role in public.user_roles
# - also turns on ENABLE_EMAIL_AUTOCONFIRM so normal signups need no email
set -euo pipefail

EMAIL="${1:-}"
PASSWORD="${2:-}"
SUPA_DIR="${SUPA_DIR:-/opt/supabase/docker}"

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "usage: bash deploy/create-admin.sh <email> <password>" >&2
  exit 1
fi
[ -f "$SUPA_DIR/.env" ] || { echo "!! $SUPA_DIR/.env not found — run deploy/supabase-selfhost.sh first" >&2; exit 1; }

cd "$SUPA_DIR"
SERVICE_KEY="$(grep -E '^SERVICE_ROLE_KEY=' .env | cut -d= -f2- | tr -d '"')"
API_URL="$(grep -E '^API_EXTERNAL_URL=' .env | cut -d= -f2- | tr -d '"')"
API_URL="${API_URL:-http://127.0.0.1:8000}"

echo "==> [1/3] enable email autoconfirm"
if grep -q '^ENABLE_EMAIL_AUTOCONFIRM=' .env; then
  sed -i 's|^ENABLE_EMAIL_AUTOCONFIRM=.*|ENABLE_EMAIL_AUTOCONFIRM=true|' .env
else
  echo 'ENABLE_EMAIL_AUTOCONFIRM=true' >> .env
fi
docker compose up -d auth >/dev/null
sleep 8

echo "==> [2/3] create user $EMAIL (email_confirm=true)"
RESP="$(curl -sS -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}")"
echo "$RESP" | head -c 300; echo

if echo "$RESP" | grep -q 'already been registered'; then
  echo "   user exists — resetting password + confirming email in the database"
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
update auth.users
   set encrypted_password = crypt('$PASSWORD', gen_salt('bf')),
       email_confirmed_at = coalesce(email_confirmed_at, now()),
       confirmed_at       = coalesce(confirmed_at, now()),
       updated_at         = now()
 where email = '$EMAIL';
SQL
fi

echo "==> [3/3] grant admin role"
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
insert into public.user_roles (user_id, role)
select id, 'admin'::app_role from auth.users where email = '$EMAIL'
on conflict (user_id, role) do nothing;
select u.email, r.role from auth.users u
  join public.user_roles r on r.user_id = u.id
 where u.email = '$EMAIL';
SQL

echo "done — sign in at https://nexuraai.dev/auth then open /admin"
