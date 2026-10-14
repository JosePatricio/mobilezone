#!/usr/bin/env bash
# Restore MobileZone from files created by backup.sh.
#
# Usage:
#   scripts/restore.sh <mobilezone_db_*.sql.gz> [mobilezone_media_*.tar.gz]
#
# WARNING: replaces the current database (and media, if given) with the backup contents.
set -euo pipefail

DB_FILE="${1:?usage: restore.sh <db.sql.gz> [media.tar.gz]}"
MEDIA_FILE="${2:-}"

DB_FILE="$(readlink -f "$DB_FILE")"
[[ -n "$MEDIA_FILE" ]] && MEDIA_FILE="$(readlink -f "$MEDIA_FILE")"

cd "$(dirname "$(readlink -f "$0")")/.."

gzip -t "$DB_FILE"
[[ -n "$MEDIA_FILE" ]] && gzip -t "$MEDIA_FILE"

read -r -p "This REPLACES the current data with the backup. Type 'yes' to continue: " answer
[[ "$answer" == "yes" ]] || { echo "Cancelled."; exit 1; }

# Stop the API so nobody writes while restoring.
docker compose stop backend frontend

echo "Restoring database from $DB_FILE..."
gunzip < "$DB_FILE" | docker compose exec -T db sh -c 'exec mysql -u root -p"$MYSQL_ROOT_PASSWORD"'

docker compose start backend
if [[ -n "$MEDIA_FILE" ]]; then
  echo "Restoring media from $MEDIA_FILE..."
  docker compose exec -T backend sh -c 'find /app/media -mindepth 1 -delete && tar xzf - -C /app/media' < "$MEDIA_FILE"
fi
docker compose start frontend

echo "Restore finished."
