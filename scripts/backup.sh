#!/usr/bin/env bash
# Daily backup of MobileZone: MySQL dump + uploaded media, optional upload to the cloud with rclone.
#
# Usage (from cron, see DOCKER.md "Backups"):
#   /opt/mobilezone/scripts/backup.sh
#
# Settings (environment variables, all optional):
#   BACKUP_DIR      local folder for the backups          (default: /var/backups/mobilezone)
#   KEEP_DAYS       days to keep, locally and remotely    (default: 14)
#   RCLONE_REMOTE   rclone destination, e.g. "gdrive:mobilezone-backups" or "dropbox:mobilezone-backups"
#                   (empty = keep the backups only on this server)
#   HEALTHCHECK_URL URL pinged after a successful run, e.g. https://hc-ping.com/<uuid> (empty = disabled)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/mobilezone}"
KEEP_DAYS="${KEEP_DAYS:-14}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"

# Run docker compose from the project folder (the parent of this script).
cd "$(dirname "$(readlink -f "$0")")/.."

STAMP="$(date +%F_%H%M)"
DB_FILE="$BACKUP_DIR/mobilezone_db_$STAMP.sql.gz"
MEDIA_FILE="$BACKUP_DIR/mobilezone_media_$STAMP.tar.gz"

log() { echo "[$(date '+%F %T')] $*"; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# 1. Database. --single-transaction gives a consistent InnoDB snapshot without locking the tables.
#    The password is read inside the container, so it never appears in cron or in `ps`.
log "Dumping database..."
docker compose exec -T db sh -c \
  'exec mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --events \
     --databases "$MYSQL_DATABASE"' 2> >(grep -v "Using a password" >&2) \
  | gzip > "$DB_FILE.part"
mv "$DB_FILE.part" "$DB_FILE"
gzip -t "$DB_FILE"

# 2. Uploaded images (media_data volume, mounted at /app/media in the backend).
log "Archiving media..."
docker compose exec -T backend tar czf - -C /app/media . > "$MEDIA_FILE.part"
mv "$MEDIA_FILE.part" "$MEDIA_FILE"
gzip -t "$MEDIA_FILE"

log "Created $(du -h "$DB_FILE" | cut -f1) $DB_FILE"
log "Created $(du -h "$MEDIA_FILE" | cut -f1) $MEDIA_FILE"

# 3. Upload to the cloud and remove remote backups older than KEEP_DAYS.
if [[ -n "$RCLONE_REMOTE" ]]; then
  log "Uploading to $RCLONE_REMOTE..."
  rclone copy "$DB_FILE" "$RCLONE_REMOTE"
  rclone copy "$MEDIA_FILE" "$RCLONE_REMOTE"
  rclone delete "$RCLONE_REMOTE" --min-age "${KEEP_DAYS}d" --include "mobilezone_*"
fi

# 4. Local rotation.
find "$BACKUP_DIR" -name 'mobilezone_*' -mtime +"$KEEP_DAYS" -delete

if [[ -n "$HEALTHCHECK_URL" ]]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" > /dev/null || log "WARNING: healthcheck ping failed"
fi

log "Backup finished."
