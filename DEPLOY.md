# Deploying to a VPS (Hostinger KVM 2 or similar)

One box runs everything: Postgres, the backend (with local matting + image
storage on volumes), and Caddy serving the built web app with automatic
HTTPS and proxying `/api` + `/vote` to the backend.

Requirements: Ubuntu 22.04/24.04 VPS with ≥4 GB RAM (8 GB recommended), a
domain with an **A record pointing at the VPS IP** (or an `sslip.io` address
like `https://187.77.129.31.sslip.io` while DNS is pending), and your AI
provider key.

The current production box: IP `187.77.129.31`, deploy user `deploy`, app at
`/home/deploy/ai-fashion`, reachable locally via the SSH alias
`hostinger-vps` (see §7).

## 1. One-time server setup (as root, via SSH)

```bash
# Docker (official convenience script) + compose plugin
curl -fsSL https://get.docker.com | sh

# A non-root deploy user with docker access
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy

# Firewall: SSH + web only
apt-get install -y ufw
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# Unattended security updates
apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades
```

Then harden SSH (§14) once your key is in `authorized_keys` for both
`root` and `deploy` — never before, or you lock yourself out.

## 2. Get the code and configure (as the deploy user)

```bash
sudo -iu deploy
git clone https://github.com/akhildabral/AI-fashion.git ai-fashion
cd ai-fashion

cp deploy/vps.env.example .env.prod
cp deploy/backend.env.example deploy/backend.env
openssl rand -hex 32        # → paste as JWT_SECRET in deploy/backend.env
nano .env.prod              # POSTGRES_PASSWORD (long random) + SITE_ADDRESS=your.domain
nano deploy/backend.env     # JWT_SECRET + AI provider key
```

Two env files, two jobs:

- **`.env.prod`** (repo root on the VPS) — compose-level settings only:
  `POSTGRES_PASSWORD` and `SITE_ADDRESS` (the domain Caddy serves and gets
  certificates for).
- **`deploy/backend.env`** — every application secret the backend reads.
  The full catalog lives in `backend/src/config/env.ts` (Zod schema — boot
  fails loudly listing anything invalid). The integrations below (§8–§10)
  each add their own keys to this file.

Also set `ADMIN_EMAILS` in `deploy/backend.env` now — a comma-separated list
of emails that are auto-approved and given the admin role on first
register/login (password or Google). This bootstraps the first superuser;
everyone else goes through the invite-only flow (§11).

## 3. Launch

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend
```

First boot: migrations apply automatically; the matting model (~170 MB)
downloads on the first wardrobe upload and persists in the `models` volume.
Once DNS resolves, Caddy fetches certificates on its own — then open
`https://your.domain`.

## 4. Backups (nightly), off-box copies, and the restore drill

```bash
crontab -e
# 0 3 * * * cd /home/deploy/ai-fashion && ./deploy/backup.sh >> ~/backup.log 2>&1
```

`deploy/backup.sh` writes two files a night to `~/backups/ai-fashion` and
keeps 14 days (`KEEP_DAYS`):

- `db-<stamp>.dump` — `pg_dump -Fc` (custom format: already compressed,
  restored with `pg_restore`, which can skip owners or pick tables).
- `uploads-<stamp>.tar.gz` — the user images from the `uploads` volume.

`deploy/deploy.sh` adds a `pre-deploy-<sha>.dump` to the same directory
before every deploy (last five kept).

**Off-box copy.** A backup on the same disk as the database is not a
backup. Install rclone once, point it at an object store (Cloudflare R2
has a free tier; Backblaze B2 and S3 work the same), and set
`RCLONE_REMOTE` in the cron line:

```bash
curl -fsSL https://rclone.org/install.sh | sudo bash
rclone config        # new remote → s3 → provider Cloudflare (or Backblaze/AWS); name it r2
rclone lsd r2:       # lists buckets — create one named zauq-backups in the provider's console
# then, in crontab -e:
# 0 3 * * * cd /home/deploy/ai-fashion && RCLONE_REMOTE=r2:zauq-backups ./deploy/backup.sh >> ~/backup.log 2>&1
```

With `RCLONE_REMOTE` set the script copies both new files there and
deletes remote files older than `KEEP_DAYS`; unset, it only writes locally.
Use a bucket key with write + delete on that bucket only.

**Restore drill (monthly, and after any Postgres upgrade).** A backup is
only real once it has been restored. `deploy/restore.sh` loads a dump into
a throwaway Postgres container — the live stack is never touched — and
prints row counts per table, failing if the restore errors or ends up with
no tables or no users:

```bash
bash deploy/restore.sh ~/backups/ai-fashion/db-20260905-030000.dump
# … per-table counts …
# ▸ 27 tables, 41 users, 33 applied migrations
# ✓ restore drill ok
bash deploy/restore.sh <dump> --keep   # leave the scratch container up to poke at with psql
```

Run it on the VPS or on a laptop with Docker (`rclone copy r2:zauq-backups/db-… .`
to fetch one).

**Restoring for real** (data loss, or a deploy whose migration cannot be
lived with) — stop the backend first so nothing writes mid-restore:

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"
$C stop backend
$C exec -T db psql -U fashion -d postgres -c 'DROP DATABASE ai_fashion' -c 'CREATE DATABASE ai_fashion OWNER fashion'
$C exec -T db pg_restore -U fashion -d ai_fashion --no-owner --no-privileges < ~/backups/ai-fashion/<file>.dump
$C up -d --no-deps backend
```

Images: `$C exec -T backend tar xzf - -C /app/uploads < uploads-<stamp>.tar.gz`
(run it with the backend stopped as well if you are rolling both back).

## 5. Updating to a new version

Normally CI does this for you (§6). Manual equivalent:

```bash
cd ~/ai-fashion && sudo -u deploy -H git pull
bash deploy/deploy.sh
```

`deploy/deploy.sh` is the whole safe sequence in one file, and it stops
before the swap the moment anything is wrong:

1. **Build** the backend and web images; they are tagged `:latest` and
   `:<git sha>` (`ai-fashion-backend:1a2b3c4d5e6f`). Build failure → prod
   untouched.
2. **Dump** the live database to `~/backups/ai-fashion/pre-deploy-<sha>.dump`
   (last five kept). Dump failure → prod untouched.
3. **Migrate** with `prisma migrate deploy` in a one-off container from the
   *new* image, while the old backend keeps serving. Failure → old backend
   still running, nothing swapped, dump on disk. (The new backend runs
   `migrate deploy` again at boot; it only applies pending migrations, so
   that pass is a no-op.)
4. **Swap** only `backend` and `web` (`--no-deps --no-build`), renaming a
   hash-prefixed container back.
5. **Wait** for the backend healthcheck — up to 90 s. Never healthy →
   **exit 1**, last 40 log lines printed, rollback hint shown.
6. **Prune** dangling images, SHA tags beyond the last three (`KEEP_IMAGES`),
   and build cache beyond 8 GB.
7. **Probe** `$PUBLIC_ORIGIN/` (must be 200) and `$PUBLIC_ORIGIN/api/health`
   (must say `"status":"ok"`) — set `PUBLIC_ORIGIN=https://…` in `.env.prod`.

Always pass `-f docker-compose.prod.yml`: the bare `docker-compose.yml` is
the dev file and only knows about `db`.

**Rollback.** Every deploy leaves the previous three image pairs on the
box. `bash deploy/rollback.sh` with no argument lists them;
`bash deploy/rollback.sh <sha>` retags that pair as `:latest`, swaps
backend + web without rebuilding, and waits for health the same way. The
database is not touched: Prisma migrations have no down step. If the bad
deploy added columns or tables, old code usually runs fine on the wider
schema; if it dropped or renamed something the old code needs, restore the
`pre-deploy-<sha>.dump` (§4, "Restoring for real") — that is what it is
for. The git checkout stays at HEAD, so revert the commit (or fix forward)
before the next push, or CI redeploys the same build.

**Changes to the `db` service.** `deploy.sh` uses `--no-deps`, so an edit
to the `db` block in `docker-compose.prod.yml` (image tag, memory cap, log
rotation) is *not* applied by a deploy — Compose would otherwise recreate
Postgres mid-deploy. Apply it yourself, in a quiet minute; Postgres is down
for a few seconds and the backend is restarted so its connection pool
starts clean:

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"
$C up -d db && sleep 10 && $C restart backend
```

**Memory caps.** backend 2 GB, db 1 GB, web 256 MB (`mem_limit`), on a
2 vCPU / 8 GB box with no swap — a runaway container gets OOM-killed and
restarted instead of the kernel picking a victim. If the backend starts
restarting under matting load, `docker inspect -f '{{.State.OOMKilled}}'
ai-fashion-backend-1` says whether the cap was hit; raise `mem_limit` (and
`NODE_OPTIONS=--max-old-space-size`, which keeps V8's heap under it) or use
the smaller `MATTING_MODEL=u2netp`. `docker stats` shows live headroom.

When a real domain lands, change `VITE_PUBLIC_ORIGIN` in `frontend/.env.production`
(share-card URLs) and `PUBLIC_ORIGIN` in `.env.prod`, then deploy.

> **Recreating backend/web safely.** `up -d --build` (and especially
> `--force-recreate`) can fail with *"container name /<hash>_ai-fashion-backend-1
> is already in use"*: Compose renames the running container while it creates
> the replacement, and a leftover with that name blocks it, sometimes leaving no
> backend or web running at all. Prefer this sequence, which never touches the
> database container (data lives in `db` and the uploads volume):
>
> ```bash
> docker compose -f docker-compose.prod.yml --env-file .env.prod build backend web
> docker compose -f docker-compose.prod.yml --env-file .env.prod stop backend web
> docker compose -f docker-compose.prod.yml --env-file .env.prod rm -f backend web
> # rm returns before the daemon has finished removing; give it a moment or
> # `up` fails with "removal of container … is already in progress".
> sleep 5
> # --no-deps: leave db alone even if its compose config changed (§5)
> docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps backend web
> ```
>
> If it has already happened: `docker ps -a | grep -E "ai-fashion-(backend|web)"`,
> `docker rm -f` those ids (never `db`), then `up -d --no-deps backend web`.


Migrations run on boot; volumes (database, uploads, models, certificates)
are untouched by rebuilds.

**The backend runs as `node` (uid 1000), not root.** The image starts as
root only long enough for `backend/docker-entrypoint.sh` to check that
`/app/uploads` and `/app/models` belong to `node`, then drops privileges
(`setpriv`) for the API, the one-off `migrate deploy`, and any
`compose run`. The volumes on the current box were created by the old
root-run image, so on the first deploy of this image the entrypoint does a
one-time `chown -R` of both volumes (logged as `entrypoint: taking
ownership of …`) — a few seconds for the uploads volume; nothing to do by
hand. If you ever need it manually (the entrypoint was bypassed, or a root
shell wrote files into the volume):

```bash
docker run --rm -v ai-fashion_uploads:/u -v ai-fashion_models:/m alpine:3.20 chown -R 1000:1000 /u /m
```

`docker compose … exec backend sh` still lands you in a root shell (exec
does not go through the entrypoint); prefix commands with
`setpriv --reuid=node --regid=node --init-groups` if the files they create
must be readable by the API.

## 6. CI/CD — auto-deploy on push to main

`.github/workflows/ci.yml` runs backend typecheck + tests + a production
dependency audit (high/critical fails; one Prisma-CLI-only advisory is
ignored with a comment), the frontend build (plus an advisory-only audit of
the web/mobile workspace, which has open highs in build-time tooling), and
the mobile checks (types, lint, jest; no native build) on every push/PR.
On a green push to `main` it then SSHes into the VPS and runs
`git reset --hard origin/main` + `deploy/deploy.sh` (30-minute timeout,
single-flight via a concurrency group, three tries with 60 s and 120 s
waits because the SSH handshake to the box drops now and then). The SSH
action is pinned to a commit SHA, not a tag. `.github/dependabot.yml`
opens weekly grouped minor/patch PRs for the three apps, the workflow
actions, and the two Dockerfiles' base images.

One-time wiring — three repository secrets at
`github.com/akhildabral/AI-fashion/settings/secrets/actions`:

| Secret        | Value                                                    |
|---------------|----------------------------------------------------------|
| `VPS_HOST`    | `187.77.129.31`                                          |
| `VPS_USER`    | `deploy`                                                 |
| `VPS_SSH_KEY` | full contents of the deploy private key, BEGIN/END lines included |
| `VPS_PORT`    | optional, defaults to 22                                 |

The keypair lives in `.deploy-secrets/github-actions-deploy-key` locally;
its public half goes in `/home/deploy/.ssh/authorized_keys` on the VPS.
Until `VPS_HOST` exists the deploy job skips cleanly, so CI works on forks.

Watching a deploy without the GitHub UI:

```bash
curl -s "https://api.github.com/repos/akhildabral/AI-fashion/actions/runs?per_page=1" | python3 -c "import json,sys; d=json.loads(sys.stdin.read(), strict=False)['workflow_runs'][0]; print(d['head_sha'][:7], d['status'], d['conclusion'])"
```

If the SSH step flakes (it has, once — transient), just run the manual
update from §5 on the box; the next push heals itself.

## 7. Secrets workflow — how credentials get to the server

**Rule: credentials never pass through chat, commits, or shell history as
literal values.** They live in the gitignored `.deploy-secrets/` folder
locally and travel to the VPS by piping the file over SSH.

- One file per integration, `KEY=value` lines, exactly the env-var names
  the backend expects: `razer-pay-test-keys`, `google-sso-keys`,
  `smtp-keys`, plus `github-actions-deploy-key` (the CI SSH key, §6).
- **Gotcha that has bitten twice: a missing trailing newline.** If the file
  doesn't end with `\n`, concatenating it into `backend.env` glues the last
  key to the next line (`...WEBHOOK_SECRET=xxxPLAN_PLUS=` — silently wrong).
  Always check/fix first:

```bash
[ -n "$(tail -c1 .deploy-secrets/FILE)" ] && echo >> .deploy-secrets/FILE
```

- The standard push-and-restart, replacing any previous values of the same
  keys (adjust the `grep -v` pattern to the integration's key prefix):

```bash
cat .deploy-secrets/FILE | ssh hostinger-vps 'set -e
cd /home/deploy/ai-fashion
grep -v "^PREFIX_" deploy/backend.env > deploy/backend.env.tmp
cat >> deploy/backend.env.tmp
mv deploy/backend.env.tmp deploy/backend.env
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend'
```

`hostinger-vps` is an SSH alias in `~/.ssh/config` pointing at
`deploy@187.77.129.31`. Mirror the same keys into local `backend/.env` for
dev the same way.

## 8. Razorpay billing (currently test mode)

Plans: Plus ₹199/mo and Pro ₹499/mo, subscriptions via Razorpay Checkout,
entitlements enforced server-side. Billing endpoints return 503 until the
keys below exist, so the app runs fine without this.

1. **Create a Razorpay account** and switch to **Test Mode**.
2. **Complete account activation first** (Settings → Account & Settings).
   This is the big gotcha: the Subscriptions API returns 401 on
   unactivated accounts even with valid keys, and **activation invalidates
   previously generated keys** — generate your API keys *after* activation,
   or regenerate them if you activated later. You'll know activation worked
   when the Subscriptions section shows plan-creation tabs.
3. **Generate API keys** (Settings → API Keys) → `RAZORPAY_KEY_ID` +
   `RAZORPAY_KEY_SECRET` into `.deploy-secrets/razer-pay-test-keys`.
4. **Create the plans** (one-time, from `backend/`):

```bash
RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... pnpm exec tsx scripts/razorpay-setup.ts
```

   It prints `RAZORPAY_PLAN_PLUS=plan_...` and `RAZORPAY_PLAN_PRO=plan_...`
   lines — add them to the same secrets file.
5. **Create the webhook** (Settings → Webhooks): URL
   `https://<your-domain>/api/billing/webhook`, pick a secret →
   `RAZORPAY_WEBHOOK_SECRET`. Subscribe at least these events (signature is
   HMAC-verified over the raw body; unknown events are acked and ignored):
   `subscription.activated`, `subscription.charged`,
   `subscription.resumed`, `subscription.pending`, `subscription.halted`,
   `subscription.cancelled`, `subscription.completed`.
6. Push the file per §7 (prefix `RAZORPAY_`). Final file shape:

```
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_PLAN_PLUS=plan_...
RAZORPAY_PLAN_PRO=plan_...
```

Going live later = repeat steps 2–6 with Live Mode keys and live plans.
Test cards: any future expiry + any CVV with card `4111 1111 1111 1111`.

## 9. Google SSO

Sign-in only — SSO never bypasses invite-only. Unknown Google accounts land
on the waitlist; `ADMIN_EMAILS` ride straight through.

1. In [Google Cloud console](https://console.cloud.google.com/apis/credentials):
   create a project → OAuth consent screen (External, add your email as a
   test user while unverified) → **Create OAuth client ID → Web
   application**.
2. **Authorized JavaScript origins**: every origin the app is served from —
   currently `https://myzauq.com` (www and the old sslip address redirect to it), plus `http://localhost:5173`
   for dev and the real domain when DNS lands. No redirect URIs needed (the
   app uses Google Identity Services' ID-token flow, not a redirect flow).
3. Put both values in `.deploy-secrets/google-sso-keys`:

```
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

   (Only the client ID is actually used — the backend verifies ID tokens
   against Google's `tokeninfo` endpoint and checks the `aud` claim; the
   secret is stored for future use.)
4. Push per §7 (prefix `GOOGLE_`). Verify:
   `curl https://<domain>/api/auth/config` should return the client ID, and
   the "Sign in with Google" button appears on `/login`. The button renders
   nothing at all while the key is unset — that's the config-gate working,
   not a bug.

## 10. SMTP (invite + verification emails)

Without SMTP the app still works: invite/verification links are printed to
the backend logs (`[mailer] SMTP not configured — invite link for ...`) and
the admin panel's copy-link button covers invites. With SMTP, emails send
for real.

Current setup — **Resend** on the domain (free tier: 100/day, 3,000/month).
The domain is verified in Resend (DKIM TXT on `resend._domainkey`, MX + SPF
on the `send` subdomain); inbound mail is ImprovMX on the apex (MX + SPF)
forwarding to Gmail; `_dmarc` is `p=none`. Do not put a second SPF record on
the apex.

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<Resend API key, "Sending access">
SMTP_FROM=ZAUQ <no-reply@myzauq.com>
```

   Port 587 = STARTTLS; the mailer switches to implicit TLS automatically
   if you use 465. Resend accepts any From address on the verified domain
   (no-reply@, hello@); an address on another domain is rejected.
3. Push per §7 (prefix `SMTP_`). End-to-end test from the prod container:

```bash
ssh hostinger-vps 'docker exec ai-fashion-backend-1 node -e "
const n=require(\"nodemailer\");
const t=n.createTransport({host:process.env.SMTP_HOST,port:+process.env.SMTP_PORT,secure:+process.env.SMTP_PORT===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
t.verify().then(()=>t.sendMail({from:process.env.SMTP_FROM,to:process.env.SMTP_USER,subject:\"SMTP test\",text:\"ok\"})).then(r=>console.log(\"SENT\",r.response)).catch(e=>{console.error(\"FAIL\",e.message);process.exit(1)})"'
```

Upgrade path once the real domain has DNS: a transactional service (Brevo
300/day free, Resend 100/day, Zoho ZeptoMail) sending from
`no-reply@<domain>` with SPF/DKIM — same five env vars, no code changes.

## 11. Invite-only auth — day-to-day operations

- Public flow: landing page → "Join the waitlist" (email only). Open signup
  is closed (`/register` redirects; the API returns 403 except for
  `ADMIN_EMAILS`).
- Admin panel at `/admin` (admin role required): **Waitlist** tab →
  *Approve & Invite* mints a 7-day invite link, emails it (§10) and shows
  it for copying; *Invite by email* skips the waitlist entirely. Google
  users are approved directly — they need no password.
- Invite link → the user sets first/last name + password → signed in.
- **Members** tab: change plan, reset password (non-Google users), suspend
  / reinstate.

## 12. Mobile app against production

```bash
cd mobile
EXPO_PUBLIC_API_URL=https://myzauq.com npx expo start --dev-client --tunnel
```

Poll share links and profile URLs use the stable domain automatically
(derived from the request host). The preview and production EAS profiles
pin `EXPO_PUBLIC_API_URL` themselves (`mobile/eas.json`); see
`mobile/README.md` for builds, updates and store submission.

## 13. The phone app: backend env vars and `.well-known`

Four keys in `deploy/backend.env` serve the app (push per §7, prefix as
noted):

| Key | Value |
|-----|-------|
| `GOOGLE_CLIENT_IDS` | comma-separated: the web client id first, then the iOS and Android OAuth client ids of the app. Replaces `GOOGLE_CLIENT_ID`, which still works as a single value. Prefix `GOOGLE_`. |
| `APPLE_BUNDLE_IDS` | `com.myzauq.app` (defaults to that); the audience Sign in with Apple identity tokens are verified against. Prefix `APPLE_`. |
| `EXPO_ACCESS_TOKEN` | optional; an Expo access token (expo.dev, Access tokens) once "Enhanced push security" is on for the project. Prefix `EXPO_`. |
| `MIN_SUPPORTED_CLIENT` | semver; app builds below it are asked to update on launch (`GET /api/health` and `/api/bootstrap` return it). Bump only after a forced-upgrade release has been in both stores for a while. |

The native push branch needs no keys (Expo's service); web push keeps
`VAPID_*`. The Prisma migrations for device sessions and native push
subscriptions are additive and run on boot with the rest.

**Universal / app links.** The site serves two files from
`frontend/public/.well-known/`, copied into the web image by the Vite
build and handled by their own `handle` blocks in `deploy/Caddyfile` (so the
SPA fallback never swallows them; the extensionless AASA gets
`Content-Type: application/json`):

- `apple-app-site-association`: replace `TEAMID` with the Apple Team ID.
- `assetlinks.json`: replace the placeholder with the SHA-256 fingerprint
  of the Android signing key (`cd mobile && eas credentials -p android`).

`frontend/public/.well-known/README.md` has the exact steps. After a deploy:

```bash
curl -sI https://myzauq.com/.well-known/apple-app-site-association | grep -i content-type
curl -s https://myzauq.com/.well-known/assetlinks.json
```

## 14. SSH hardening (do this yourself, as root, one step at a time)

Nothing below is applied by any script. Order matters: each step is
verified from a **second** terminal before the first one is closed, so a
mistake never locks you out.

1. **Keys in place for both users.** Your public key must be in
   `/root/.ssh/authorized_keys` and `/home/deploy/.ssh/authorized_keys`
   (mode `0600`, directory `0700`, owned by the user). CI's key is already
   in `deploy`'s file (§6). Test: `ssh -o PasswordAuthentication=no
   deploy@187.77.129.31 true` and the same for `root` must both succeed.
2. **Keys only, no root login.** Write a drop-in so `apt` upgrades never
   overwrite it:

   ```bash
   cat > /etc/ssh/sshd_config.d/10-hardening.conf <<'EOF'
   PasswordAuthentication no
   KbdInteractiveAuthentication no
   PermitRootLogin no
   PubkeyAuthentication yes
   MaxAuthTries 3
   LoginGraceTime 30
   X11Forwarding no
   EOF
   sshd -t && systemctl reload ssh
   ```

   `sshd -t` must print nothing. From the second terminal, confirm
   `ssh deploy@… true` still works and `ssh root@…` is now refused.
   Root work from here on is `ssh deploy@… ` then `sudo -i` — so first
   `usermod -aG sudo deploy` and confirm `sudo -v` works as `deploy`
   (with `PermitRootLogin no` this is the only way back in as root).
3. **fail2ban** for the password-guessing noise that still hits port 22:

   ```bash
   apt-get install -y fail2ban
   cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
   [sshd]
   enabled  = true
   backend  = systemd
   maxretry = 5
   findtime = 10m
   bantime  = 1h
   EOF
   systemctl enable --now fail2ban
   fail2ban-client status sshd      # shows the jail and current bans
   ```

   Whitelist your own IP if it is static: `ignoreip = 127.0.0.1/8 <your ip>`
   in the same file, then `systemctl restart fail2ban`.
4. **Optional, later.** Move SSH to a non-standard port (`Port 2222` in the
   drop-in, `ufw allow 2222/tcp` *before* reloading, `VPS_PORT` secret in
   GitHub); keep `ufw` to 22/2222, 80, 443 only (`ufw status`).

## Local smoke test of the production stack

Runs the real prod images on your machine, HTTP on port 8080:

```bash
cp deploy/vps.env.example .env.prod
# edit .env.prod → SITE_ADDRESS=:8080, any POSTGRES_PASSWORD
cp deploy/backend.env.example deploy/backend.env   # fill JWT/AI key
docker compose -f docker-compose.prod.yml -f deploy/compose.local-test.yml \
  --env-file .env.prod up -d --build
open http://localhost:8080
```

## Troubleshooting

- `docker compose ... logs backend` — migration or env validation errors
  print at boot and the container restarts until fixed. A migration that
  fails is caught earlier by `deploy.sh` step 3, before the old backend is
  stopped; `EACCES` on `/app/uploads` means the volume is not owned by
  uid 1000 — see the `chown` one-liner in §5.
- `deploy.sh` ended with `backend never became healthy` → the new build is
  up but failing its healthcheck; the log tail is in the CI output.
  `bash deploy/rollback.sh <previous sha>` puts the last good pair back
  in about a minute, then debug at leisure.
- Web requests hang or `502` while `/api/health` is fine → check Caddy's
  access log: `docker compose ... exec web tail -f /data/access.log`
  (JSON, one line per request, rotated at 5 × 50 MB).
- Caddy stuck on certificates → DNS not propagated yet, or port 80/443
  blocked; check `docker compose ... logs web`.
- Memory pressure on 4 GB boxes → set `MATTING_MODEL=u2netp` in
  `deploy/backend.env` (smaller model, weaker mattes; generative cleanup
  still covers quality).
- Backend restart-looping right after a secrets push → almost always a
  malformed `deploy/backend.env` line; see the trailing-newline gotcha
  in §7, then check the Zod error in the backend logs.
- Razorpay 401 with keys you *know* are right → account not activated, or
  keys generated pre-activation (§8 step 2).
- Google button missing on `/login` → `GET /api/auth/config` returns
  `googleClientId: null`; the env var isn't set on the backend. Google
  popup shows an origin error → the current origin isn't in the OAuth
  client's Authorized JavaScript origins (§9 step 2).
- Invite emails not arriving → check backend logs for `[mailer]` lines; if
  SMTP is unset they contain the invite link itself, which unblocks you
  immediately.
