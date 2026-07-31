# Deploy — every time (Nexura AI)

## Option 1 — automatic (recommended)

Every push to `main` deploys itself via `.github/workflows/deploy.yml`.

One-time setup:

1. On the VPS, create a deploy key and print it:

   ```bash
   ssh root@169.58.105.190
   ssh-keygen -t ed25519 -f /root/.ssh/gh_deploy -N ""
   cat /root/.ssh/gh_deploy.pub >> /root/.ssh/authorized_keys
   cat /root/.ssh/gh_deploy          # copy this PRIVATE key
   ```

2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

   | Name | Value |
   |---|---|
   | `VPS_SSH_KEY` | the whole private key from step 1 |
   | `VPS_HOST` | `169.58.105.190` (optional, this is the default) |
   | `VPS_USER` | `root` (optional, this is the default) |

3. Push anything to `main` → Actions tab shows the deploy running.

Manual re-run without a code change: **Actions → Deploy to VPS → Run workflow**.

## Option 2 — one command from your machine

```bash
bun run ship
```

typecheck → tests → rsync → build on server → migrations → restart → health check.

## Option 3 — one command on the server

```bash
ssh root@169.58.105.190 'bash /var/www/nexuraai/deploy/deploy.sh'
```

git pull → bun install → build → migrations → restart.

## Database only

```bash
ssh root@169.58.105.190 'bash /var/www/nexuraai/deploy/migrate.sh'
```

## Check it worked

```bash
systemctl status nexuraai
journalctl -u nexuraai -f
curl -I https://nexuraai.dev
```
