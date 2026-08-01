#!/usr/bin/env bash
# ============================================================================
# Nexura AI — apply supabase/migrations/*.sql to self-hosted Supabase.
#
# Run on the VPS (deploy/ship.sh calls it automatically):
#   bash /var/www/nexuraai/deploy/migrate.sh
#
# Every file is applied once, inside a transaction, and recorded in
# public.schema_migrations with its checksum. Re-running is a no-op; a file
# that changed after being applied is reported instead of silently skipped.
# ============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexuraai}"
SB_DIR="${SB_DIR:-/opt/supabase}"
MIG_DIR="$APP_DIR/supabase/migrations"

[ -d "$MIG_DIR" ] || { echo "no migrations directory at $MIG_DIR"; exit 0; }

DB_CONTAINER="$(cd "$SB_DIR" && docker compose ps -q db 2>/dev/null || true)"
[ -n "$DB_CONTAINER" ] || { echo "supabase db container is not running (cd $SB_DIR && docker compose up -d)"; exit 1; }

psql_q() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtAX -c "$1"; }
psql_f() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qX; }

echo "-- ensuring migration ledger"
psql_q "
create table if not exists public.schema_migrations (
  version text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
revoke all on public.schema_migrations from anon, authenticated;
grant all on public.schema_migrations to service_role;
alter table public.schema_migrations enable row level security;
" >/dev/null

applied=0
skipped=0
changed=0
baselined=0

# BASELINE=1 records every pending migration as applied WITHOUT running it.
# Use once when the schema was already created by deploy/supabase-schema.sh.
BASELINE="${BASELINE:-0}"

# REPAIR=1 re-runs every migration file even if the ledger says it is applied.
# Each file runs in its own transaction and a failure is reported but does NOT
# stop the run — use it when a BASELINE=1 run skipped SQL (missing functions).
REPAIR="${REPAIR:-0}"
repaired=0
failed=0

shopt -s nullglob
for file in $(ls -1 "$MIG_DIR"/*.sql | sort); do
  version="$(basename "$file" .sql)"
  checksum="$(md5sum "$file" | awk '{print $1}')"
  recorded="$(psql_q "select checksum from public.schema_migrations where version = '$version';" | tr -d '[:space:]')"

  if [ "$REPAIR" = "1" ]; then
    printf '   ~ %s ' "$version"
    if { echo "begin;"; cat "$file"; echo ";"; echo "commit;"; } | psql_f >/dev/null 2>&1; then
      echo "ok"
      repaired=$((repaired + 1))
    else
      echo "skipped (already present or not replayable)"
      failed=$((failed + 1))
    fi
    psql_q "insert into public.schema_migrations (version, checksum) values ('$version', '$checksum')
            on conflict (version) do update set checksum = excluded.checksum;" >/dev/null
    continue
  fi

  if [ -n "$recorded" ]; then
    if [ "$recorded" != "$checksum" ]; then
      echo "   ! $version was applied earlier but the file changed — left untouched"
      changed=$((changed + 1))
    else
      skipped=$((skipped + 1))
    fi
    continue
  fi

  if [ "$BASELINE" = "1" ]; then
    echo "   = $version (baselined, not executed)"
    psql_q "insert into public.schema_migrations (version, checksum) values ('$version', '$checksum') on conflict (version) do nothing;" >/dev/null
    baselined=$((baselined + 1))
    continue
  fi

  echo "   + $version"
  {
    echo "begin;"
    cat "$file"
    echo ";"
    echo "insert into public.schema_migrations (version, checksum) values ('$version', '$checksum');"
    echo "commit;"
  } | psql_f || {
    echo "migration $version failed — nothing was committed"
    echo "if this schema already exists, run once: BASELINE=1 bash $APP_DIR/deploy/migrate.sh"
    exit 1
  }
  applied=$((applied + 1))
done

if [ "$REPAIR" = "1" ]; then
  echo "-- repair: $repaired files replayed, $failed skipped"
else
  echo "-- migrations: $applied applied, $skipped already up to date, $baselined baselined${changed:+, $changed modified after apply}"
fi
