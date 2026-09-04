#!/usr/bin/env bash
# Deploy the current checkout on the VPS: build first, then swap backend and
# web without ever touching the database container. Halts before stopping
# anything if the build fails, so a bad build never takes prod down.
#
#   cd /home/deploy/ai-fashion && bash deploy/deploy.sh
#
# Run as a user who can talk to Docker. Git is left to the caller (CI does a
# reset --hard; by hand, `sudo -u deploy -H git pull` first).
set -u
cd "$(dirname "$0")/.."
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"

echo "▸ building backend and web"
if ! $C build backend web; then
  echo "✗ build failed — prod left untouched"
  exit 1
fi

echo "▸ swapping backend and web"
$C stop backend web
$C rm -f backend web
# rm returns before the daemon has finished; `up` otherwise trips on
# "removal of container … is already in progress".
sleep 5
$C up -d backend web

# Compose sometimes leaves the new container with a hash prefix; put the
# name back so logs and scripts keep working.
for c in $(docker ps --format '{{.Names}}' | grep -E '^[0-9a-f]+_ai-fashion-(web|backend)-1$'); do
  docker rename "$c" "${c#*_}"
done

echo "▸ waiting for the backend"
for _ in $(seq 1 30); do
  if docker inspect -f '{{.State.Health.Status}}' ai-fashion-backend-1 2>/dev/null | grep -q healthy; then break; fi
  sleep 2
done
docker ps --format '{{.Names}} {{.Status}}' | grep -i ai-fashion
docker logs --tail 20 ai-fashion-backend-1 2>&1 | grep -iE 'migrat|listen|error' | tail -5
docker image prune -f >/dev/null
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
fi
echo "✓ deployed"
