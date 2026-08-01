#!/usr/bin/env bash
# ============================================================================
# Nexura AI — post-migration verification.
#
# Confirms the RPCs the API calls at runtime actually exist in the self-hosted
# Supabase database BEFORE the API is restarted. If a function is missing (the
# usual cause: an old BASELINE=1 run recorded migrations without running them)
# it replays the migrations once with REPAIR=1 and verifies again.
#
#   bash /var/www/nexuraai/deploy/verify-schema.sh
# ============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexuraai}"
SB_DIR="${SB_DIR:-/opt/supabase}"

DB_CONTAINER="$(cd "$SB_DIR" && docker compose ps -q db 2>/dev/null || true)"
[ -n "$DB_CONTAINER" ] || { echo "!! supabase db container is not running (cd $SB_DIR && docker compose up -d)" >&2; exit 1; }

psql_q() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -qtAX -c "$1"; }

# signature => human label
REQUIRED=(
  "public.spend_credits(text,text,numeric,text,uuid,text,uuid)|credit charge"
  "public.credit_balance(uuid)|credit balance"
  "public.has_role(uuid,app_role)|role check"
  "public.record_request_cost(uuid,numeric,integer,text)|cost tracking"
)

check_all() {
  local missing=()
  for entry in "${REQUIRED[@]}"; do
    local sig="${entry%%|*}" label="${entry##*|}"
    if [ "$(psql_q "select to_regprocedure('$sig') is not null;" | tr -d '[:space:]')" = "t" ]; then
      echo "   ok  $label"
    else
      echo "   !!  $label  ($sig)"
      missing+=("$sig")
    fi
  done
  [ ${#missing[@]} -eq 0 ]
}

echo "-- verifying database functions"
if check_all; then
  echo "-- schema verified"
  exit 0
fi

echo "-- missing functions detected, replaying migrations (REPAIR=1)"
REPAIR=1 bash "$APP_DIR/deploy/migrate.sh" || true

echo "-- re-verifying database functions"
if check_all; then
  echo "-- schema verified after repair"
  exit 0
fi

cat >&2 <<EOF
!! database schema is incomplete — the API was NOT restarted.
   Chat/autofix would fail with "Could not find the function public.spend_credits".
   Inspect with:
     docker exec -i \$(cd $SB_DIR && docker compose ps -q db) psql -U postgres -d postgres -c "\\df public.spend_credits"
EOF
exit 1
