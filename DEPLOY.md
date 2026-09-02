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

## 4. Backups (nightly)

```bash
chmod +x deploy/backup.sh
crontab -e
# 0 3 * * * cd ~/ai-fashion && ./deploy/backup.sh >> ~/backup.log 2>&1
```

Dumps the database and user images to `~/backups/ai-fashion`, keeping 14 days.

## 5. Updating to a new version

Normally CI does this for you (§6). Manual equivalent:

```bash
cd ~/ai-fashion && git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

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
> docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend web
> ```
>
> If it has already happened: `docker ps -a | grep -E "ai-fashion-(backend|web)"`,
> `docker rm -f` those ids (never `db`), then `up -d backend web`.


Migrations run on boot; volumes (database, uploads, models, certificates)
are untouched by rebuilds.

## 6. CI/CD — auto-deploy on push to main

`.github/workflows/ci.yml` runs backend typecheck + tests and the frontend
build on every push/PR. On a green push to `main` it then SSHes into the VPS
and runs `git reset --hard origin/main` + a compose rebuild (30-minute
timeout, single-flight via a concurrency group).

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
   currently `https://187.77.129.31.sslip.io`, plus `http://localhost:5173`
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

Current setup — **Gmail with an App Password** (fine up to ~500/day):

1. On the Google account: enable 2-Step Verification, then create an App
   Password at `myaccount.google.com/apppasswords`.
2. `.deploy-secrets/smtp-keys`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=<16-char app password, spaces removed>
SMTP_FROM=AI Fashion <you@gmail.com>
```

   Port 587 = STARTTLS; the mailer switches to implicit TLS automatically
   if you use 465. Gmail rewrites the From *address* to the authenticated
   account — the display name sticks, the address must be yours.
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
EXPO_PUBLIC_API_URL=https://your.domain npx expo start --tunnel
```

Poll share links and profile URLs now use the stable domain automatically
(derived from the request host).

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
  print at boot and the container restarts until fixed.
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
