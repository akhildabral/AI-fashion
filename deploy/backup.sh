#!/usr/bin/env bash
# Nightly backup: Postgres dump + user images, kept for 14 days.
# Cron (as the deploy user, from the repo directory):
#   0 3 * * * cd /opt/ai-fashion && ./deploy/backup.sh >> /var/log/ai-fashion-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/ai-fashion}"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

# Database dump straight out of the running container.
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  pg_dump -U fashion ai_fashion | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"

# User images, streamed out of the backend container's uploads volume.
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T backend \
  tar czf - -C /app/uploads . > "$BACKUP_DIR/uploads-$STAMP.tar.gz"

find "$BACKUP_DIR" -type f -mtime "+$KEEP_DAYS" -delete
echo "backup ok: $STAMP"
