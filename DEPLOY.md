# Deploying to a VPS (Hostinger KVM 2 or similar)

One box runs everything: Postgres, the backend (with local matting + image
storage on volumes), and Caddy serving the built web app with automatic
HTTPS and proxying `/api` + `/vote` to the backend.

Requirements: Ubuntu 22.04/24.04 VPS with ≥4 GB RAM (8 GB recommended), a
domain with an **A record pointing at the VPS IP**, and your AI provider key.

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

```bash
cd ~/ai-fashion && git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Migrations run on boot; volumes (database, uploads, models, certificates)
are untouched by rebuilds.

## 6. Mobile app against production

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
