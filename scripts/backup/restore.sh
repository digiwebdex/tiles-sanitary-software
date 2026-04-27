#!/usr/bin/env bash
# ============================================================
# TilesERP Database Restore Script
# Downloads from Google Drive and restores database
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env" 2>/dev/null || source /opt/tileserp-backup/.env

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_FILE="${LOG_DIR}/restore_${TIMESTAMP}.log"
mkdir -p "${LOG_DIR}" "${TEMP_DIR}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"; }

send_notification() {
  local STATUS="$1" MSG="$2"
  local SUBJECT="[${SERVER_NAME}] Restore ${STATUS} - ${TIMESTAMP}"
  local BODY="Server: ${SERVER_NAME}\nDate: ${TIMESTAMP}\nStatus: ${STATUS}\n\nDetails:\n${MSG}\n\nLog: ${LOG_FILE}"
  echo -e "${BODY}" | mail -s "${SUBJECT}" \
    -S smtp="${SMTP_SERVER}:${SMTP_PORT}" \
    -S smtp-use-starttls -S smtp-auth=login \
    -S smtp-auth-user="${SMTP_USER}" -S smtp-auth-password="${SMTP_PASS}" \
    -S from="${SMTP_USER}" "${NOTIFY_EMAIL}" 2>>"${LOG_FILE}" || log "WARN: Email failed"
}

log_restore_to_supabase() {
  local FILE="$1" TYPE="$2" DB="$3" APP="$4" STATUS="$5" ERR="${6:-}" LOGS="${7:-}"
  if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_KEY:-}" ]]; then
    curl -s -X POST "${SUPABASE_URL}/rest/v1/restore_logs" \
      -H "apikey: ${SUPABASE_SERVICE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "{
        \"backup_file_name\": \"${FILE}\",
        \"backup_type\": \"${TYPE}\",
        \"database_name\": \"${DB}\",
        \"app_name\": \"${APP}\",
        \"initiated_by_name\": \"CLI-${USER:-root}\",
        \"status\": \"${STATUS}\",
        \"pre_restore_backup_taken\": ${PRE_RESTORE_BACKUP:-false},
        \"error_message\": $(echo "${ERR}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))' 2>/dev/null || echo '""'),
        \"logs\": $(echo "${LOGS}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()[:5000]))' 2>/dev/null || echo '""'),
        \"completed_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }" 2>>"${LOG_FILE}" || log "WARN: Supabase logging failed"
  fi
}

# ── Pre-restore safety backup ─────────────────────────────────
pre_restore_backup() {
  local TYPE="$1" DB="$2"
  log "Creating pre-restore safety backup of ${TYPE}/${DB}..."
  PRE_RESTORE_BACKUP="true"
  
  case "${TYPE}" in
    postgresql)
      local SAFE_FILE="${TEMP_DIR}/pre_restore_${DB}_${TIMESTAMP}.sql.gz"
      PGPASSWORD="${PG_PASSWORD}" pg_dump -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" \
        -Fc --no-owner "${DB}" 2>>"${LOG_FILE}" | gzip > "${SAFE_FILE}"
      log "Safety backup saved: ${SAFE_FILE}"
      ;;
    mysql)
      local SAFE_FILE="${TEMP_DIR}/pre_restore_${DB}_${TIMESTAMP}.sql.gz"
      mysqldump -h "${MYSQL_HOST}" -P "${MYSQL_PORT}" -u "${MYSQL_USER}" \
        -p"${MYSQL_PASSWORD}" --single-transaction "${DB}" 2>>"${LOG_FILE}" | gzip > "${SAFE_FILE}"
      log "Safety backup saved: ${SAFE_FILE}"
      ;;
    mongodb)
      local SAFE_FILE="${TEMP_DIR}/pre_restore_${DB}_${TIMESTAMP}.archive.gz"
      local URI="mongodb://"
      [[ -n "${MONGO_USER}" ]] && URI+="${MONGO_USER}:${MONGO_PASSWORD}@"
      URI+="${MONGO_HOST}:${MONGO_PORT}/${DB}"
      [[ -n "${MONGO_USER}" ]] && URI+="?authSource=${MONGO_AUTH_DB}"
      mongodump --uri="${URI}" --archive --gzip > "${SAFE_FILE}" 2>>"${LOG_FILE}"
      log "Safety backup saved: ${SAFE_FILE}"
      ;;
  esac
}

# ── Restore Functions ─────────────────────────────────────────
restore_postgresql() {
  local DUMP_FILE="$1" DB="$2"
  log "Restoring PostgreSQL: ${DB} from ${DUMP_FILE}"
  
  local RESTORE_OUT
  RESTORE_OUT=$(gunzip -c "${DUMP_FILE}" | PGPASSWORD="${PG_PASSWORD}" pg_restore \
    -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" \
    -d "${DB}" --clean --if-exists --no-owner --no-acl 2>&1) || true
  
  echo "${RESTORE_OUT}" >> "${LOG_FILE}"
  log "PostgreSQL restore completed for ${DB}"
  echo "${RESTORE_OUT}"
}

restore_mysql() {
  local DUMP_FILE="$1" DB="$2"
  log "Restoring MySQL: ${DB} from ${DUMP_FILE}"
  
  local RESTORE_OUT
  RESTORE_OUT=$(gunzip -c "${DUMP_FILE}" | mysql -h "${MYSQL_HOST}" -P "${MYSQL_PORT}" \
    -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${DB}" 2>&1) || true
  
  echo "${RESTORE_OUT}" >> "${LOG_FILE}"
  log "MySQL restore completed for ${DB}"
  echo "${RESTORE_OUT}"
}

restore_mongodb() {
  local DUMP_FILE="$1" DB="$2"
  log "Restoring MongoDB: ${DB} from ${DUMP_FILE}"
  
  local URI="mongodb://"
  [[ -n "${MONGO_USER}" ]] && URI+="${MONGO_USER}:${MONGO_PASSWORD}@"
  URI+="${MONGO_HOST}:${MONGO_PORT}/${DB}"
  [[ -n "${MONGO_USER}" ]] && URI+="?authSource=${MONGO_AUTH_DB}"
  
  local RESTORE_OUT
  RESTORE_OUT=$(mongorestore --uri="${URI}" --archive="${DUMP_FILE}" --gzip --drop 2>&1) || true
  
  echo "${RESTORE_OUT}" >> "${LOG_FILE}"
  log "MongoDB restore completed for ${DB}"
  echo "${RESTORE_OUT}"
}

# ── Main ──────────────────────────────────────────────────────
usage() {
  echo "Usage: $0 <db_type> <db_name> <backup_file_or_gdrive_path> [--no-safety-backup]"
  echo ""
  echo "  db_type:   postgresql | mysql | mongodb"
  echo "  db_name:   Name of the database to restore into"
  echo "  backup:    Local file path OR Google Drive path (relative to backup root)"
  echo ""
  echo "Examples:"
  echo "  $0 postgresql tilessaas /opt/tileserp-backup/data/postgresql/tilessaas/2025-01-15/dump.sql.gz"
  echo "  $0 postgresql tilessaas postgresql/tilessaas/2025-01-15/dump.sql.gz"
  exit 1
}

[[ $# -lt 3 ]] && usage

DB_TYPE="$1"
DB_NAME="$2"
BACKUP_PATH="$3"
SKIP_SAFETY="${4:-}"
PRE_RESTORE_BACKUP="false"

# Confirmation
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║         ⚠️  DATABASE RESTORE WARNING ⚠️       ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Type:     ${DB_TYPE}"
echo "║  Database: ${DB_NAME}"
echo "║  From:     ${BACKUP_PATH}"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "This will OVERWRITE the current ${DB_NAME} database."
if [[ -n "${RESTORE_AUTO_CONFIRM:-}" ]]; then
  CONFIRM="${RESTORE_AUTO_CONFIRM}"
  echo "(auto-confirmed via RESTORE_AUTO_CONFIRM)"
else
  echo "Type RESTORE to confirm:"
  read -r CONFIRM
fi
[[ "${CONFIRM}" != "RESTORE" ]] && { echo "Aborted."; exit 1; }

log "=========================================="
log "Restore Started: ${DB_TYPE}/${DB_NAME}"
log "=========================================="

# Download from Google Drive if not a local file
LOCAL_FILE="${BACKUP_PATH}"
if [[ ! -f "${BACKUP_PATH}" ]]; then
  log "Downloading from Google Drive: ${BACKUP_PATH}"
  LOCAL_FILE="${TEMP_DIR}/$(basename "${BACKUP_PATH}")"
  rclone copy "${RCLONE_REMOTE}:${GDRIVE_ROOT_FOLDER}/${BACKUP_PATH}" "${TEMP_DIR}/" \
    --log-file="${LOG_FILE}" 2>>"${LOG_FILE}"
  
  if [[ ! -f "${LOCAL_FILE}" ]]; then
    log "ERROR: Download failed"
    log_restore_to_supabase "$(basename "${BACKUP_PATH}")" "${DB_TYPE}" "${DB_NAME}" "unknown" "failed" "Download failed"
    send_notification "FAILED" "Restore of ${DB_TYPE}/${DB_NAME} failed: could not download backup"
    exit 1
  fi
fi

# Pre-restore safety backup
if [[ "${SKIP_SAFETY}" != "--no-safety-backup" ]]; then
  pre_restore_backup "${DB_TYPE}" "${DB_NAME}"
fi

# Execute restore
RESTORE_OUTPUT=""
case "${DB_TYPE}" in
  postgresql) RESTORE_OUTPUT=$(restore_postgresql "${LOCAL_FILE}" "${DB_NAME}") ;;
  mysql)      RESTORE_OUTPUT=$(restore_mysql "${LOCAL_FILE}" "${DB_NAME}") ;;
  mongodb)    RESTORE_OUTPUT=$(restore_mongodb "${LOCAL_FILE}" "${DB_NAME}") ;;
  *)          log "Unknown database type: ${DB_TYPE}"; exit 1 ;;
esac

log_restore_to_supabase "$(basename "${BACKUP_PATH}")" "${DB_TYPE}" "${DB_NAME}" "${PG_APP_NAME:-unknown}" "success" "" "${RESTORE_OUTPUT}"
send_notification "SUCCESS" "Restore completed:\n  Type: ${DB_TYPE}\n  Database: ${DB_NAME}\n  From: ${BACKUP_PATH}"

log "=========================================="
log "Restore Finished Successfully"
log "=========================================="
