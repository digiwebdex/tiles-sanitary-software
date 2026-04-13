#!/bin/bash
# TilesERP Database Restore Script
# Usage: ./restore.sh /path/to/backup.dump.gz

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <backup_file.dump.gz>"
  exit 1
fi

BACKUP_FILE="$1"
DB_CONTAINER="tileserp-db-1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "⚠️  WARNING: This will DROP and recreate the tileserp database!"
echo "Backup file: $BACKUP_FILE"
read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo "[$(date)] Decompressing backup..."
TEMP_DUMP="/tmp/tileserp_restore.dump"
gunzip -c "$BACKUP_FILE" > "$TEMP_DUMP"

echo "[$(date)] Dropping and recreating database..."
docker exec "$DB_CONTAINER" psql -U tileserp -d postgres \
  -c "DROP DATABASE IF EXISTS tileserp;" \
  -c "CREATE DATABASE tileserp OWNER tileserp;"

echo "[$(date)] Restoring from backup..."
docker cp "$TEMP_DUMP" "$DB_CONTAINER:/tmp/restore.dump"
docker exec "$DB_CONTAINER" pg_restore -U tileserp -d tileserp /tmp/restore.dump

rm -f "$TEMP_DUMP"

echo "[$(date)] Restore complete!"
echo "Restart the API: docker compose -f docker-compose.prod.yml restart api"
