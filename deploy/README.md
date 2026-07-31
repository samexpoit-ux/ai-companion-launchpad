# VPS Deploy — nexuraai.dev (169.58.105.190)

## 0) DNS (already done)
| Type | Name | Value |
|---|---|---|
| A | @ | 169.58.105.190 |
| A | www | 169.58.105.190 |

Check: `dig +short nexuraai.dev` → `169.58.105.190`

## 1) One-time server setup
```bash
ssh root@169.58.105.190
curl -fsSL https://raw.githubusercontent.com/abexpoit-blip/ai-companion-platform/main/deploy/vps-setup.sh -o vps-setup.sh
bash vps-setup.sh
```
Or if the repo isn't pushed yet: `scp -r deploy root@169.58.105.190:/root/` then `bash /root/deploy/vps-setup.sh`.

The script installs Node 22, Bun, nginx, ufw, builds the app with
`NITRO_PRESET=node-server`, registers the `nexura` systemd service on
127.0.0.1:3000, wires nginx, and issues a Let's Encrypt cert for both
`nexuraai.dev` and `www.nexuraai.dev`.

## 2) Environment variables
The first run creates `/var/www/nexura/.env`. Fill it with the values from this
Lovable project's `.env` (backend URL + publishable key + project id, service role
key, `OPENROUTER_API_KEY`), then:
```bash
bash /var/www/nexura/deploy/deploy.sh
```

## 3) Backend (auth) settings
In Lovable Cloud → Auth, add to Site URL / redirect URLs:
- `https://nexuraai.dev`
- `https://www.nexuraai.dev`
- `https://nexuraai.dev/auth/callback`

Google OAuth console → Authorized redirect URI must include the backend
callback URL, and authorized origins must include `https://nexuraai.dev`.

## 4) Everyday commands
```bash
systemctl status nexura          # state
journalctl -u nexura -f          # live logs
bash /var/www/nexura/deploy/deploy.sh   # pull + rebuild + restart
nginx -t && systemctl reload nginx
certbot renew --dry-run          # SSL auto-renew check
```

## Troubleshooting
- **502 Bad Gateway** → app not running: `journalctl -u nexura -n 50`.
- **certbot fails** → DNS not propagated yet; wait and rerun
  `certbot --nginx -d nexuraai.dev -d www.nexuraai.dev`.
- **Blank page / env errors** → `.env` missing `VITE_*` values at *build* time;
  fill them and rerun `deploy.sh` (VITE vars are inlined during build).
