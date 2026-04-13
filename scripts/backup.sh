#!/bin/bash
# TilesERP Database Backup Script
# Add to crontab: 0 2 * * * /opt/tileserp/scripts/backup.sh

set -euo pipefail

BACKUP_DIR="/opt/tileserp/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_CONTAINER="tileserp-db-1"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# Dump database
docker exec "$DB_CONTAINER" pg_dump -U tileserp -d tileserp --format=custom \
  > "$BACKUP_DIR/tileserp_${TIMESTAMP}.dump"

# Compress
gzip "$BACKUP_DIR/tileserp_${TIMESTAMP}.dump"

echo "[$(date)] Backup saved: tileserp_${TIMESTAMP}.dump.gz"

# Delete old backups
find "$BACKUP_DIR" -name "*.dump.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Cleanup done. Backups older than ${RETENTION_DAYS} days removed."
echo "[$(date)] Backup complete."
