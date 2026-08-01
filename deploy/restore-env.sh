#!/usr/bin/env bash
# Restore the real production env onto the checkout.
#
# WHY: `.env` is tracked in the repo (Lovable manages it), so every
# `git reset --hard origin/main` overwrites the server's real keys with the
# repo placeholder. The source of truth on the VPS is therefore
# /etc/nexuraai.env (never touched by git); this script copies it back into
# $APP_DIR/.env after every reset, because the build needs VITE_* values.
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/nexuraai}"
SECRET_ENV="${SECRET_ENV:-/etc/nexuraai.env}"

if [ -f "$SECRET_ENV" ]; then
  install -m 600 "$SECRET_ENV" "$APP_DIR/.env"
  chown nexuraai:nexuraai "$APP_DIR/.env" 2>/dev/null || true
  echo "restored $APP_DIR/.env from $SECRET_ENV"
elif [ -f "$APP_DIR/.env" ] && grep -q '^OPENROUTER_API_KEY=sk-or-' "$APP_DIR/.env"; then
  # First run after this change: promote the existing good .env to /etc.
  install -m 600 "$APP_DIR/.env" "$SECRET_ENV"
  echo "seeded $SECRET_ENV from $APP_DIR/.env"
elif command -v systemctl >/dev/null 2>&1; then
  # Recovery path for upgrades from the old deploy scripts: the checkout may
  # already be clobbered, while the still-running service retains the real
  # values it loaded before git reset. Recover them without printing secrets.
  PID="$(systemctl show nexuraai --property=MainPID --value 2>/dev/null || true)"
  if [ -n "$PID" ] && [ "$PID" != "0" ] && [ -r "/proc/$PID/environ" ]; then
    TMP_ENV="$(mktemp)"
    trap 'rm -f "$TMP_ENV"' EXIT
    tr '\0' '\n' < "/proc/$PID/environ" | grep -E '^(NODE_ENV|PORT|VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY|VITE_SUPABASE_PROJECT_ID|SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|OPENROUTER_API_KEY)=' > "$TMP_ENV" || true
    if grep -q '^OPENROUTER_API_KEY=sk-or-' "$TMP_ENV" && grep -q '^VITE_SUPABASE_URL=' "$TMP_ENV"; then
      install -m 600 "$TMP_ENV" "$SECRET_ENV"
      install -m 600 "$SECRET_ENV" "$APP_DIR/.env"
      chown nexuraai:nexuraai "$APP_DIR/.env" 2>/dev/null || true
      echo "recovered production env from the running nexuraai service"
      exit 0
    fi
  fi

  echo "!! no usable $SECRET_ENV and the running service has no recoverable env"
  echo "   run: bash $APP_DIR/deploy/set-env.sh sk-or-v1-<key>"
  exit 1
else
  echo "!! no $SECRET_ENV — run: bash $APP_DIR/deploy/set-env.sh sk-or-v1-<key>"
  exit 1
fi
