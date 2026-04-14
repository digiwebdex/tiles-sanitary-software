#!/usr/bin/env bash
# ============================================================
# TilesERP Automated Database Backup Script
# Backs up PostgreSQL, MySQL, MongoDB → local → Google Drive
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env" 2>/dev/null || source /opt/tileserp-backup/.env

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DATE_FOLDER=$(date +"%Y-%m-%d")
LOG_FILE="${LOG_DIR}/backup_${TIMESTAMP}.log"

mkdir -p "${BACKUP_BASE_DIR}" "${LOG_DIR}" "${TEMP_DIR}"

# ── Helpers ───────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"; }
die() { log "FATAL: $*"; send_notification "FAILED" "$*"; exit 1; }

send_notification() {
  local STATUS="$1" MSG="$2"
  local SUBJECT="[${SERVER_NAME}] Backup ${STATUS} - ${TIMESTAMP}"
  local BODY="Server: ${SERVER_NAME}\nDate: ${TIMESTAMP}\nStatus: ${STATUS}\n\nDetails:\n${MSG}\n\nLog: ${LOG_FILE}"
  
  echo -e "${BODY}" | mail -s "${SUBJECT}" \
    -S smtp="${SMTP_SERVER}:${SMTP_PORT}" \
    -S smtp-use-starttls \
    -S smtp-auth=login \
    -S smtp-auth-user="${SMTP_USER}" \
    -S smtp-auth-password="${SMTP_PASS}" \
    -S from="${SMTP_USER}" \
    "${NOTIFY_EMAIL}" 2>>"${LOG_FILE}" || log "WARN: Email notification failed"
}

log_to_supabase() {
  local TYPE="$1" DB="$2" APP="$3" FILE="$4" SIZE="$5" STATUS="$6" ERR="${7:-}"
  if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_KEY:-}" ]]; then
    curl -s -X POST "${SUPABASE_URL}/rest/v1/backup_logs" \
      -H "apikey: ${SUPABASE_SERVICE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "{
        \"backup_type\": \"${TYPE}\",
        \"database_name\": \"${DB}\",
        \"app_name\": \"${APP}\",
        \"file_name\": \"${FILE}\",
        \"file_size\": ${SIZE},
        \"status\": \"${STATUS}\",
        \"error_message\": $(echo "${ERR}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))' 2>/dev/null || echo '""'),
        \"completed_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }" 2>>"${LOG_FILE}" || log "WARN: Supabase logging failed"
  fi
}

verify_file() {
  local FILE="$1"
  [[ -f "${FILE}" ]] && [[ $(stat -c%s "${FILE}" 2>/dev/null || stat -f%z "${FILE}" 2>/dev/null) -gt 100 ]]
}

upload_to_gdrive() {
  local LOCAL_PATH="$1" REMOTE_PATH="$2"
  log "Uploading to Google Drive: ${REMOTE_PATH}"
  rclone copy "${LOCAL_PATH}" "${RCLONE_REMOTE}:${GDRIVE_ROOT_FOLDER}/${REMOTE_PATH}" \
    --log-file="${LOG_FILE}" --log-level INFO 2>>"${LOG_FILE}"
  
  # Verify upload
  if rclone ls "${RCLONE_REMOTE}:${GDRIVE_ROOT_FOLDER}/${REMOTE_PATH}/$(basename "${LOCAL_PATH}")" &>/dev/null; then
    log "Upload verified: ${REMOTE_PATH}/$(basename "${LOCAL_PATH}")"
    return 0
  else
    log "ERROR: Upload verification failed for ${REMOTE_PATH}"
    return 1
  fi
}

# ── PostgreSQL Backup ─────────────────────────────────────────
backup_postgresql() {
  [[ "${PG_ENABLED}" != "true" ]] && return 0
  log "=== Starting PostgreSQL backups ==="
  
  IFS=',' read -ra DBS <<< "${PG_DATABASES}"
  for DB in "${DBS[@]}"; do
    DB=$(echo "$DB" | xargs)
    local DUMP_DIR="${BACKUP_BASE_DIR}/postgresql/${PG_APP_NAME}/${DATE_FOLDER}"
    local DUMP_FILE="${PG_APP_NAME}_postgresql_${DB}_${TIMESTAMP}.sql.gz"
    mkdir -p "${DUMP_DIR}"
    
    log "Backing up PostgreSQL: ${DB}"
    PGPASSWORD="${PG_PASSWORD}" pg_dump \
      -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" \
      -Fc --no-owner --no-acl "${DB}" 2>>"${LOG_FILE}" | \
      gzip > "${DUMP_DIR}/${DUMP_FILE}"
    
    if verify_file "${DUMP_DIR}/${DUMP_FILE}"; then
      local FSIZE=$(stat -c%s "${DUMP_DIR}/${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_DIR}/${DUMP_FILE}")
      log "PostgreSQL dump OK: ${DUMP_FILE} (${FSIZE} bytes)"
      
      if upload_to_gdrive "${DUMP_DIR}/${DUMP_FILE}" "postgresql/${PG_APP_NAME}/${DATE_FOLDER}"; then
        log_to_supabase "postgresql" "${DB}" "${PG_APP_NAME}" "${DUMP_FILE}" "${FSIZE}" "uploaded"
        BACKUP_RESULTS+=("✅ PostgreSQL/${DB}: ${DUMP_FILE} ($(numfmt --to=iec ${FSIZE}))")
      else
        log_to_supabase "postgresql" "${DB}" "${PG_APP_NAME}" "${DUMP_FILE}" "${FSIZE}" "failed" "Upload failed"
        BACKUP_RESULTS+=("⚠️ PostgreSQL/${DB}: Dumped but upload failed")
        FAILURES=$((FAILURES + 1))
      fi
    else
      log "ERROR: PostgreSQL dump failed for ${DB}"
      log_to_supabase "postgresql" "${DB}" "${PG_APP_NAME}" "${DUMP_FILE}" "0" "failed" "Dump file invalid"
      BACKUP_RESULTS+=("❌ PostgreSQL/${DB}: Dump failed")
      FAILURES=$((FAILURES + 1))
    fi
  done
}

# ── MySQL Backup ──────────────────────────────────────────────
backup_mysql() {
  [[ "${MYSQL_ENABLED}" != "true" ]] && return 0
  log "=== Starting MySQL backups ==="
  
  IFS=',' read -ra DBS <<< "${MYSQL_DATABASES}"
  for DB in "${DBS[@]}"; do
    DB=$(echo "$DB" | xargs)
    local DUMP_DIR="${BACKUP_BASE_DIR}/mysql/${MYSQL_APP_NAME}/${DATE_FOLDER}"
    local DUMP_FILE="${MYSQL_APP_NAME}_mysql_${DB}_${TIMESTAMP}.sql.gz"
    mkdir -p "${DUMP_DIR}"
    
    log "Backing up MySQL: ${DB}"
    mysqldump -h "${MYSQL_HOST}" -P "${MYSQL_PORT}" -u "${MYSQL_USER}" \
      -p"${MYSQL_PASSWORD}" --single-transaction --routines --triggers \
      "${DB}" 2>>"${LOG_FILE}" | gzip > "${DUMP_DIR}/${DUMP_FILE}"
    
    if verify_file "${DUMP_DIR}/${DUMP_FILE}"; then
      local FSIZE=$(stat -c%s "${DUMP_DIR}/${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_DIR}/${DUMP_FILE}")
      log "MySQL dump OK: ${DUMP_FILE} (${FSIZE} bytes)"
      
      if upload_to_gdrive "${DUMP_DIR}/${DUMP_FILE}" "mysql/${MYSQL_APP_NAME}/${DATE_FOLDER}"; then
        log_to_supabase "mysql" "${DB}" "${MYSQL_APP_NAME}" "${DUMP_FILE}" "${FSIZE}" "uploaded"
        BACKUP_RESULTS+=("✅ MySQL/${DB}: ${DUMP_FILE} ($(numfmt --to=iec ${FSIZE}))")
      else
        log_to_supabase "mysql" "${DB}" "${MYSQL_APP_NAME}" "${DUMP_FILE}" "${FSIZE}" "failed" "Upload failed"
        BACKUP_RESULTS+=("⚠️ MySQL/${DB}: Dumped but upload failed")
        FAILURES=$((FAILURES + 1))
      fi
    else
      log "ERROR: MySQL dump failed for ${DB}"
      log_to_supabase "mysql" "${DB}" "${MYSQL_APP_NAME}" "${DUMP_FILE}" "0" "failed" "Dump file invalid"
      BACKUP_RESULTS+=("❌ MySQL/${DB}: Dump failed")
      FAILURES=$((FAILURES + 1))
    fi
  done
}

# ── MongoDB Backup ────────────────────────────────────────────
backup_mongodb() {
  [[ "${MONGO_ENABLED}" != "true" ]] && return 0
  log "=== Starting MongoDB backups ==="
  
  IFS=',' read -ra DBS <<< "${MONGO_DATABASES}"
  for DB in "${DBS[@]}"; do
    DB=$(echo "$DB" | xargs)
    local DUMP_DIR="${BACKUP_BASE_DIR}/mongodb/${MONGO_APP_NAME}/${DATE_FOLDER}"
    local DUMP_FILE="${MONGO_APP_NAME}_mongodb_${DB}_${TIMESTAMP}.archive.gz"
    mkdir -p "${DUMP_DIR}"
    
    log "Backing up MongoDB: ${DB}"
    local MONGO_URI="mongodb://"
    [[ -n "${MONGO_USER}" ]] && MONGO_URI+="${MONGO_USER}:${MONGO_PASSWORD}@"
    MONGO_URI+="${MONGO_HOST}:${MONGO_PORT}/${DB}"
    [[ -n "${MONGO_USER}" ]] && MONGO_URI+="?authSource=${MONGO_AUTH_DB}"
    
    mongodump --uri="${MONGO_URI}" --archive --gzip \
      > "${DUMP_DIR}/${DUMP_FILE}" 2>>"${LOG_FILE}"
    
    if verify_file "${DUMP_DIR}/${DUMP_FILE}"; then
      local FSIZE=$(stat -c%s "${DUMP_DIR}/${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_DIR}/${DUMP_FILE}")
      log "MongoDB dump OK: ${DUMP_FILE} (${FSIZE} bytes)"
      
      if upload_to_gdrive "${DUMP_DIR}/${DUMP_FILE}" "mongodb/${MONGO_APP_NAME}/${DATE_FOLDER}"; then
        log_to_supabase "mongodb" "${DB}" "${MONGO_APP_NAME}" "${DUMP_FILE}" "${FSIZE}" "uploaded"
        BACKUP_RESULTS+=("✅ MongoDB/${DB}: ${DUMP_FILE} ($(numfmt --to=iec ${FSIZE}))")
      else
        log_to_supabase "mongodb" "${DB}" "${MONGO_APP_NAME}" "${DUMP_FILE}" "${FSIZE}" "failed" "Upload failed"
        BACKUP_RESULTS+=("⚠️ MongoDB/${DB}: Dumped but upload failed")
        FAILURES=$((FAILURES + 1))
      fi
    else
      log "ERROR: MongoDB dump failed for ${DB}"
      log_to_supabase "mongodb" "${DB}" "${MONGO_APP_NAME}" "${DUMP_FILE}" "0" "failed" "Dump file invalid"
      BACKUP_RESULTS+=("❌ MongoDB/${DB}: Dump failed")
      FAILURES=$((FAILURES + 1))
    fi
  done
}

# ── Retention Cleanup ─────────────────────────────────────────
cleanup_old_backups() {
  log "=== Running retention cleanup ==="
  
  # Local cleanup: remove files older than retention period
  find "${BACKUP_BASE_DIR}" -type f -name "*.gz" -mtime "+${RETENTION_DAILY_DAYS}" -delete 2>>"${LOG_FILE}"
  find "${BACKUP_BASE_DIR}" -type d -empty -delete 2>>"${LOG_FILE}" || true
  
  # Remote cleanup: remove old folders from Google Drive
  local CUTOFF_DATE=$(date -d "-${RETENTION_DAILY_DAYS} days" +%Y-%m-%d 2>/dev/null || date -v-${RETENTION_DAILY_DAYS}d +%Y-%m-%d)
  for DB_TYPE in postgresql mysql mongodb; do
    if rclone lsd "${RCLONE_REMOTE}:${GDRIVE_ROOT_FOLDER}/${DB_TYPE}" 2>/dev/null; then
      rclone lsd "${RCLONE_REMOTE}:${GDRIVE_ROOT_FOLDER}/${DB_TYPE}" 2>/dev/null | while read -r _ _ _ FOLDER; do
        # List app folders
        rclone lsd "${RCLONE_REMOTE}:${GDRIVE_ROOT_FOLDER}/${DB_TYPE}/${FOLDER}" 2>/dev/null | while read -r _ _ _ DATE_DIR; do
          if [[ "${DATE_DIR}" < "${CUTOFF_DATE}" ]]; then
            log "Removing old remote backup: ${DB_TYPE}/${FOLDER}/${DATE_DIR}"
            rclone purge "${RCLONE_REMOTE}:${GDRIVE_ROOT_FOLDER}/${DB_TYPE}/${FOLDER}/${DATE_DIR}" 2>>"${LOG_FILE}" || true
          fi
        done
      done
    fi
  done
  
  log "Retention cleanup complete"
}

# ── Main ──────────────────────────────────────────────────────
main() {
  log "=========================================="
  log "TilesERP Backup Started: ${TIMESTAMP}"
  log "=========================================="
  
  FAILURES=0
  BACKUP_RESULTS=()
  
  backup_postgresql
  backup_mysql
  backup_mongodb
  cleanup_old_backups
  
  # Summary
  local SUMMARY=""
  for R in "${BACKUP_RESULTS[@]}"; do
    SUMMARY+="${R}\n"
  done
  
  if [[ ${FAILURES} -gt 0 ]]; then
    log "Backup completed with ${FAILURES} failure(s)"
    send_notification "PARTIAL FAILURE" "Completed with ${FAILURES} failure(s):\n\n${SUMMARY}"
  else
    if [[ ${#BACKUP_RESULTS[@]} -eq 0 ]]; then
      log "No databases configured for backup"
      send_notification "SKIPPED" "No databases were configured for backup. Check .env file."
    else
      log "All backups completed successfully"
      send_notification "SUCCESS" "All backups completed:\n\n${SUMMARY}"
    fi
  fi
  
  log "=========================================="
  log "Backup Finished"
  log "=========================================="
}

main "$@"
