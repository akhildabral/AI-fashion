#!/usr/bin/env bash
# Nightly backup: Postgres dump (pg_dump custom format — restore with
# pg_restore, or rehearse with deploy/restore.sh) plus the user images,
# kept locally for KEEP_DAYS (14). With RCLONE_REMOTE set (e.g.
# r2:zauq-backups) the new files are also copied off the box with rclone
# and remote files older than KEEP_DAYS are pruned; unset, that part is
# skipped.
#
# Cron (as the deploy user):
#   0 3 * * * cd /home/deploy/ai-fashion && RCLONE_REMOTE=r2:zauq-backups ./deploy/backup.sh >> ~/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/ai-fashion}"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP_DAYS="${KEEP_DAYS:-14}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

mkdir -p "$BACKUP_DIR"
db="$BACKUP_DIR/db-$STAMP.dump"
uploads="$BACKUP_DIR/uploads-$STAMP.tar.gz"

# Database dump straight out of the running container. -Fc is compressed
# already and lets pg_restore pick tables, reorder, or skip owners.
$C exec -T db pg_dump -U fashion -Fc ai_fashion > "$db"
[ -s "$db" ] || { echo "✗ empty dump"; rm -f "$db"; exit 1; }

# User images, streamed out of the backend container's uploads volume.
$C exec -T backend tar czf - -C /app/uploads . > "$uploads"

if [ -n "$RCLONE_REMOTE" ]; then
  command -v rclone >/dev/null || { echo "✗ RCLONE_REMOTE is set but rclone is not installed"; exit 1; }
  rclone copy "$db" "$RCLONE_REMOTE/"
  rclone copy "$uploads" "$RCLONE_REMOTE/"
  rclone delete --min-age "${KEEP_DAYS}d" "$RCLONE_REMOTE"
  echo "off-box copy ok: $RCLONE_REMOTE"
fi

find "$BACKUP_DIR" -type f -mtime "+$KEEP_DAYS" -delete
echo "backup ok: $STAMP (db $(du -h "$db" | cut -f1), uploads $(du -h "$uploads" | cut -f1))"
