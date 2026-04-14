#!/usr/bin/env bash
# ============================================================
# List available backups on Google Drive (JSON output for API)
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env" 2>/dev/null || source /opt/tileserp-backup/.env

FORMAT="${1:-text}"

if [[ "${FORMAT}" == "json" ]]; then
  echo "["
  FIRST=true
  for DB_TYPE in postgresql mysql mongodb; do
    rclone lsjson "${RCLONE_REMOTE}:${GDRIVE_ROOT_FOLDER}/${DB_TYPE}" -R --files-only 2>/dev/null | \
      python3 -c "
import json, sys
data = json.load(sys.stdin)
for f in data:
    path = f['Path']
    parts = path.split('/')
    if len(parts) >= 3:
        app = parts[0]
        date = parts[1]
        fname = parts[-1]
    else:
        app = 'unknown'
        date = ''
        fname = path
    entry = {
        'file_name': fname,
        'path': '${DB_TYPE}/' + path,
        'backup_type': '${DB_TYPE}',
        'app_name': app,
        'date': date,
        'size': f.get('Size', 0),
        'modified': f.get('ModTime', ''),
        'storage_location': 'google_drive'
    }
    prefix = ',' if not ${FIRST} else ''
    print(prefix + json.dumps(entry))
" 2>/dev/null || true
    FIRST=false
  done
  echo "]"
else
  echo "=== Available Backups ==="
  for DB_TYPE in postgresql mysql mongodb; do
    echo ""
    echo "── ${DB_TYPE} ──"
    rclone ls "${RCLONE_REMOTE}:${GDRIVE_ROOT_FOLDER}/${DB_TYPE}" 2>/dev/null || echo "  No backups found"
  done
fi
