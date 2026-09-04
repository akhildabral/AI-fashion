#!/usr/bin/env bash
# Deploy the current checkout on the VPS. In order:
#   1. build the backend and web images (tagged :latest and :<git sha>)
#   2. pg_dump the live database to ~/backups/ai-fashion/pre-deploy-<sha>.dump
#   3. run `prisma migrate deploy` from the NEW image against the live db
#      while the old backend keeps serving — abort here if it fails
#   4. swap backend + web (the db container is never touched: --no-deps)
#   5. wait for the backend healthcheck; exit 1 if it never turns healthy
#   6. prune: dangling images, SHA tags beyond the last 3, build cache
#   7. probe $PUBLIC_ORIGIN/ (200) and /api/health (status ok)
#
#   cd /home/deploy/ai-fashion && bash deploy/deploy.sh
#
# Run as a user who can talk to Docker. Git is left to the caller (CI does a
# reset --hard; by hand, `sudo -u deploy -H git pull` first). Undo with
# `bash deploy/rollback.sh <sha>` — `docker images ai-fashion-backend` lists
# the SHAs still on the box.
set -u
cd "$(dirname "$0")/.."
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"
sha="$(git rev-parse --short=12 HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/ai-fashion}"
KEEP_IMAGES="${KEEP_IMAGES:-3}"

echo "▸ deploying $sha"

echo "▸ building backend and web"
if ! $C build backend web; then
  echo "✗ build failed — prod left untouched"
  exit 1
fi
docker tag ai-fashion-backend:latest "ai-fashion-backend:$sha"
docker tag ai-fashion-web:latest "ai-fashion-web:$sha"

echo "▸ pre-deploy database dump"
mkdir -p "$BACKUP_DIR"
dump="$BACKUP_DIR/pre-deploy-$sha.dump"
if [ "${SKIP_PREDEPLOY_DUMP:-}" = "1" ]; then
  echo "  skipped (SKIP_PREDEPLOY_DUMP=1)"
elif $C exec -T db pg_dump -U fashion -Fc ai_fashion > "$dump" && [ -s "$dump" ]; then
  echo "  $dump ($(du -h "$dump" | cut -f1))"
  # Keep the five most recent pre-deploy dumps; backup.sh's nightly dumps
  # live alongside and have their own retention.
  ls -1t "$BACKUP_DIR"/pre-deploy-*.dump 2>/dev/null | tail -n +6 | xargs -r rm -f
else
  rm -f "$dump"
  echo "✗ pg_dump failed — is the db container up? prod left untouched"
  exit 1
fi

echo "▸ applying migrations from the new image (old backend keeps serving)"
# A one-off container from the image just built, same env/volumes as the
# service. `migrate deploy` only applies pending migrations, so the boot-time
# run inside the new backend is a no-op afterwards. --no-deps so compose
# does not touch db; --rm so nothing is left behind.
if ! $C run --rm -T --no-deps backend node_modules/.bin/prisma migrate deploy; then
  echo "✗ migrate deploy failed — old backend still running, nothing swapped"
  echo "  pre-deploy dump: $dump"
  exit 1
fi

echo "▸ swapping backend and web"
$C stop backend web
$C rm -f backend web
# rm returns before the daemon has finished; `up` otherwise trips on
# "removal of container … is already in progress".
sleep 5
# --no-deps: never recreate db from here, even when its compose config has
# changed (db changes are applied deliberately, see DEPLOY.md §5).
# --no-build: the images were built above; never rebuild mid-swap.
$C up -d --no-deps --no-build backend web

# Compose sometimes leaves the new container with a hash prefix; put the
# name back so logs and scripts keep working.
for c in $(docker ps --format '{{.Names}}' | grep -E '^[0-9a-f]+_ai-fashion-(web|backend)-1$'); do
  docker rename "$c" "${c#*_}"
done

echo "▸ waiting for the backend"
healthy=0
for _ in $(seq 1 45); do
  if docker inspect -f '{{.State.Health.Status}}' ai-fashion-backend-1 2>/dev/null | grep -q '^healthy$'; then
    healthy=1
    break
  fi
  sleep 2
done
docker ps --format '{{.Names}} {{.Status}}' | grep -i ai-fashion
if [ "$healthy" != "1" ]; then
  echo "✗ backend never became healthy — last 40 log lines:"
  docker logs --tail 40 ai-fashion-backend-1 2>&1
  echo "  roll back with: bash deploy/rollback.sh <previous sha>   (docker images ai-fashion-backend)"
  exit 1
fi
docker logs --tail 20 ai-fashion-backend-1 2>&1 | grep -iE 'migrat|listen|error' | tail -5

echo "▸ pruning"
docker image prune -f >/dev/null
# SHA-tagged images newest first; the last $KEEP_IMAGES stay for rollback
# (the newest shares every layer with :latest, so it costs nothing).
for repo in ai-fashion-backend ai-fashion-web; do
  docker images "$repo" --format '{{.Tag}}' | grep -vE '^(latest|<none>)$' \
    | tail -n +$((KEEP_IMAGES + 1)) \
    | while read -r tag; do docker rmi "$repo:$tag" >/dev/null 2>&1 || true; done
done
# Every build leaves ~2.5GB of BuildKit cache behind and Docker never expires
# it on its own: 180 deploys had filled 72GB (78% of the disk) before this
# line existed. Keep only the most recent builds' worth so rebuilds stay
# fast, and let the rest go.
docker builder prune -f --keep-storage 8GB >/dev/null

origin="$(grep -E '^PUBLIC_ORIGIN=' .env.prod 2>/dev/null | cut -d= -f2-)"
if [ -n "$origin" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' "$origin/")"
  echo "▸ $origin → HTTP $code"
  [ "$code" = "200" ] || { echo "✗ site not answering 200"; exit 1; }
  health="$(curl -s --max-time 10 "$origin/api/health")"
  echo "▸ $origin/api/health → $health"
  echo "$health" | grep -Eq '"status": ?"ok"' || { echo "✗ /api/health did not report status ok"; exit 1; }
fi
echo "✓ deployed $sha"
