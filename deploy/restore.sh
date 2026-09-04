#!/usr/bin/env bash
# Restore drill: load a pg_dump custom-format dump (backup.sh's db-*.dump
# or deploy.sh's pre-deploy-*.dump) into a throwaway Postgres container and
# print per-table row counts, so a backup is known to be restorable before
# the day it is needed. Never touches the live stack.
#
#   bash deploy/restore.sh ~/backups/ai-fashion/db-20260905-030000.dump
#   bash deploy/restore.sh <dump> --keep   # leave the scratch container up
#
# Run it monthly and after any Postgres upgrade. Needs only Docker. To
# restore into the live database instead, see DEPLOY.md, "Restore".
set -euo pipefail
dump="${1:?usage: bash deploy/restore.sh <dump-file> [--keep]}"
keep="${2:-}"
[ -f "$dump" ] || { echo "✗ no such file: $dump"; exit 1; }
name="zauq-restore-$$"
image="${RESTORE_IMAGE:-postgres:16-alpine}"

cleanup() {
  if [ "$keep" = "--keep" ]; then
    echo "▸ scratch container kept: docker exec -it $name psql -U postgres restore   (remove: docker rm -f $name)"
  else
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "▸ starting scratch postgres ($image)"
docker run -d --name "$name" -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=restore "$image" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U postgres -d restore >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$name" pg_isready -U postgres -d restore >/dev/null 2>&1 \
  || { echo "✗ scratch postgres did not come up in 60 s"; docker logs --tail 20 "$name"; exit 1; }

echo "▸ restoring $(basename "$dump") ($(du -h "$dump" | cut -f1))"
# --no-owner/--no-privileges: the dump was taken as the `fashion` role,
# which does not exist here. --exit-on-error turns a partial restore into
# a failed drill instead of a warning scrolled past.
docker exec -i "$name" pg_restore -U postgres -d restore --no-owner --no-privileges --exit-on-error < "$dump"

echo "▸ row counts"
docker exec "$name" psql -U postgres -d restore -At -c "
  SELECT '  ' || table_name || ': ' ||
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name;"

tables="$(docker exec "$name" psql -U postgres -d restore -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")"
users="$(docker exec "$name" psql -U postgres -d restore -At -c 'SELECT count(*) FROM "User"')"
migrations="$(docker exec "$name" psql -U postgres -d restore -At -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")"
echo "▸ $tables tables, $users users, $migrations applied migrations"
if [ "$tables" -eq 0 ] || [ "$users" -eq 0 ]; then
  echo "✗ sanity check failed: a real backup has tables and at least one user"
  exit 1
fi
echo "✓ restore drill ok"
