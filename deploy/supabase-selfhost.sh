#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Nexura AI — self-hosted Supabase on the VPS (169.58.105.190 / nexuraai.dev)
#
# Installs Docker + the official Supabase docker stack under /opt/supabase,
# generates fresh secrets (JWT secret, anon + service keys, DB + dashboard
# passwords), exposes Studio and the API through nginx on db.nexuraai.dev,
# and prints the env values to paste into /var/www/nexuraai/.env.
#
# Cloud VPS 12: 12 vCPU / 48 GB RAM / 400 GB disk — plenty for this stack.
#
#   ssh root@169.58.105.190
#   bash /var/www/nexuraai/deploy/supabase-selfhost.sh
# ---------------------------------------------------------------------------
set -euo pipefail

DOMAIN="nexuraai.dev"
DB_HOST="db.${DOMAIN}"          # Supabase API + Studio hostname
SB_DIR="/opt/supabase"
EMAIL="admin@${DOMAIN}"

echo "==> [1/7] base packages"
apt-get update -y
apt-get install -y ca-certificates curl git openssl jq nginx python3 python3-pip

echo "==> [2/7] docker engine"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> [3/7] fetch supabase docker stack"
if [ ! -d "$SB_DIR" ]; then
  git clone --depth 1 https://github.com/supabase/supabase "$SB_DIR-src"
  mkdir -p "$SB_DIR"
  cp -r "$SB_DIR-src/docker/." "$SB_DIR/"
  rm -rf "$SB_DIR-src"
fi
cd "$SB_DIR"
[ -f .env ] || cp .env.example .env

echo "==> [4/7] generate secrets"
if ! grep -q "NEXURA_GENERATED" .env; then
  JWT_SECRET="$(openssl rand -hex 32)"
  POSTGRES_PASSWORD="$(openssl rand -hex 20)"
  DASHBOARD_PASSWORD="$(openssl rand -hex 12)"
  SECRET_KEY_BASE="$(openssl rand -hex 32)"
  VAULT_ENC_KEY="$(openssl rand -hex 16)"

  # anon + service_role JWTs signed with JWT_SECRET (HS256, 10 year expiry)
  pip3 install --quiet --break-system-packages pyjwt >/dev/null 2>&1 || pip3 install --quiet pyjwt
  read -r ANON_KEY SERVICE_KEY <<<"$(JWT_SECRET="$JWT_SECRET" python3 - <<'PY'
import os, time, jwt
s = os.environ["JWT_SECRET"]
iat = int(time.time()); exp = iat + 10 * 365 * 24 * 3600
mk = lambda role: jwt.encode({"role": role, "iss": "supabase", "iat": iat, "exp": exp}, s, algorithm="HS256")
print(mk("anon"), mk("service_role"))
PY
)"

  set_env() { sed -i "s|^$1=.*|$1=$2|" .env; }
  set_env JWT_SECRET "$JWT_SECRET"
  set_env ANON_KEY "$ANON_KEY"
  set_env SERVICE_ROLE_KEY "$SERVICE_KEY"
  set_env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  set_env DASHBOARD_USERNAME "nexura"
  set_env DASHBOARD_PASSWORD "$DASHBOARD_PASSWORD"
  set_env SECRET_KEY_BASE "$SECRET_KEY_BASE"
  set_env VAULT_ENC_KEY "$VAULT_ENC_KEY"
  set_env SITE_URL "https://${DOMAIN}"
  set_env API_EXTERNAL_URL "https://${DB_HOST}"
  set_env SUPABASE_PUBLIC_URL "https://${DB_HOST}"
  set_env ADDITIONAL_REDIRECT_URLS "https://${DOMAIN}/**,https://www.${DOMAIN}/**"
  set_env DISABLE_SIGNUP "false"
  set_env ENABLE_EMAIL_AUTOCONFIRM "false"
  echo "# NEXURA_GENERATED" >> .env
fi

echo "==> [5/7] start supabase"
docker compose pull
docker compose up -d
sleep 15
docker compose ps

echo "==> [6/7] nginx vhost for ${DB_HOST}"
cat > /etc/nginx/sites-available/supabase <<NGINX
server {
    listen 80;
    server_name ${DB_HOST};
    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/supabase /etc/nginx/sites-enabled/supabase
nginx -t && systemctl reload nginx

echo "==> [7/7] TLS for ${DB_HOST}"
command -v certbot >/dev/null 2>&1 || apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d "${DB_HOST}" --non-interactive --agree-tos -m "${EMAIL}" --redirect || \
  echo "!! certbot failed — add an A record for ${DB_HOST} -> 169.58.105.190 and rerun"

echo
echo "======================================================================="
echo " Self-hosted Supabase is up:  https://${DB_HOST}   (Studio: same URL)"
echo " Studio login: nexura / $(grep '^DASHBOARD_PASSWORD=' "$SB_DIR/.env" | cut -d= -f2)"
echo
echo " Put these in /var/www/nexuraai/.env, then run deploy/deploy.sh:"
echo "-----------------------------------------------------------------------"
echo "VITE_SUPABASE_URL=https://${DB_HOST}"
echo "VITE_SUPABASE_PUBLISHABLE_KEY=$(grep '^ANON_KEY=' "$SB_DIR/.env" | cut -d= -f2)"
echo "VITE_SUPABASE_PROJECT_ID=nexura"
echo "SUPABASE_URL=https://${DB_HOST}"
echo "SUPABASE_SERVICE_ROLE_KEY=$(grep '^SERVICE_ROLE_KEY=' "$SB_DIR/.env" | cut -d= -f2)"
echo "OPENROUTER_API_KEY=<your openrouter key>"
echo "-----------------------------------------------------------------------"
echo " Then load the schema:  bash /var/www/nexuraai/deploy/supabase-schema.sh"
echo "======================================================================="
