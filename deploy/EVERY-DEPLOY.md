# Deploy — every time (Nexura AI)

## Option 0 — one command: push my changes + update the VPS

```bash
bun run git:deploy                        # commit + push, then update the VPS
bun run git:deploy -m "chat history fix"  # custom commit message
bun run git:deploy --no-push              # VPS only: pull what's on GitHub
```

It does, in order: `git add -A` + commit (only if you have changes) → `git push`
→ on the VPS `git reset --hard origin/main` → `bun install` → production build →
`supabase/migrations/*.sql` → `systemctl restart nexuraai` → nginx reload →
local + public health check, and prints the deployed commit hash so you can
confirm the VPS is running exactly your code.

Needs key-based SSH once: `ssh-copy-id root@169.58.105.190`.

## Option 1 — automatic (no command at all)


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
