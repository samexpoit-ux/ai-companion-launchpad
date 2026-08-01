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
else
  echo "!! no $SECRET_ENV — run: bash $APP_DIR/deploy/set-env.sh sk-or-v1-<key>"
  exit 1
fi
