#!/usr/bin/env bash
# Roll backend + web back to a previously deployed image pair.
#
#   bash deploy/rollback.sh <sha>   # a sha printed by deploy.sh
#   bash deploy/rollback.sh         # list the SHAs still on the box
#
# Retags ai-fashion-{backend,web}:<sha> as :latest and restarts both
# without rebuilding. The database is not touched: Prisma migrations have
# no down step, so if the bad deploy changed the schema in a way the old
# code cannot live with, restore the pre-deploy dump instead (DEPLOY.md,
# "Rollback"). Note the git checkout stays at HEAD — the next push to main
# redeploys it, so fix forward or revert the commit as well.
set -u
cd "$(dirname "$0")/.."
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"

list() {
  echo "available (newest first):"
  docker images ai-fashion-backend --format '  {{.Tag}}  built {{.CreatedSince}}' | grep -vE '^  (latest|<none>) '
}

sha="${1:-}"
if [ -z "$sha" ]; then
  echo "usage: bash deploy/rollback.sh <sha>"
  list
  exit 2
fi
for repo in ai-fashion-backend ai-fashion-web; do
  if ! docker image inspect "$repo:$sha" >/dev/null 2>&1; then
    echo "✗ $repo:$sha is not on this box"
    list
    exit 1
  fi
done

echo "▸ rolling back to $sha"
docker tag "ai-fashion-backend:$sha" ai-fashion-backend:latest
docker tag "ai-fashion-web:$sha" ai-fashion-web:latest

$C stop backend web
$C rm -f backend web
sleep 5
$C up -d --no-deps --no-build backend web
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
  echo "✗ backend never became healthy on $sha — last 40 log lines:"
  docker logs --tail 40 ai-fashion-backend-1 2>&1
  exit 1
fi
echo "✓ rolled back to $sha (database untouched)"
