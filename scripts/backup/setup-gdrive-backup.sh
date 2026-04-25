#!/usr/bin/env bash
# ============================================================
# TilesERP — Google Drive Backup Setup (One-Shot)
# ------------------------------------------------------------
# What this does:
#   1. Installs rclone (if missing) and mailutils
#   2. Walks you through Google Drive OAuth (one-time, browser)
#   3. Copies the backup script + .env to /opt/tileserp-backup/
#   4. Sets up a daily cron job (2 AM Bangladesh time)
#   5. Runs ONE test backup so you see it appear in Drive immediately
#
# Run on VPS as root:
#   bash /var/www/tilessaas/scripts/backup/setup-gdrive-backup.sh
# ============================================================
set -euo pipefail

PROJECT_DIR="/var/www/tilessaas"
INSTALL_DIR="/opt/tileserp-backup"
SCRIPT_SRC="${PROJECT_DIR}/scripts/backup/backup.sh"
ENV_EXAMPLE="${PROJECT_DIR}/scripts/backup/backup.env.example"
ENV_FILE="${INSTALL_DIR}/.env"
LOG_DIR="${INSTALL_DIR}/logs"

echo "═══════════════════════════════════════════════════════════"
echo "  TilesERP → Google Drive Backup Setup"
echo "  Target Drive account: bditengineer@gmail.com"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Install dependencies ─────────────────────────────
echo "[1/6] Installing dependencies (rclone, mailutils, postgresql-client)..."
if ! command -v rclone >/dev/null 2>&1; then
  curl -fsSL https://rclone.org/install.sh | bash
else
  echo "  ✓ rclone already installed ($(rclone --version | head -1))"
fi
apt-get update -qq
apt-get install -y -qq mailutils postgresql-client coreutils >/dev/null 2>&1 || true
echo ""

# ── Step 2: Create install directory ─────────────────────────
echo "[2/6] Creating install directory at ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}/data" "${LOG_DIR}" "${INSTALL_DIR}/tmp"
cp "${SCRIPT_SRC}" "${INSTALL_DIR}/backup.sh"
chmod +x "${INSTALL_DIR}/backup.sh"
echo ""

# ── Step 3: Configure .env ───────────────────────────────────
if [[ -f "${ENV_FILE}" ]]; then
  echo "[3/6] .env already exists at ${ENV_FILE} — keeping existing values."
  echo "      (Edit manually if you need to change DB password, SMTP, etc.)"
else
  echo "[3/6] Creating .env at ${ENV_FILE}..."
  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  echo ""
  echo "  ⚠️  IMPORTANT: Edit ${ENV_FILE} now and set:"
  echo "     - PG_PASSWORD (your PostgreSQL password)"
  echo "     - PG_DATABASES (default: tilessaas — confirm matches your DB name)"
  echo "     - PG_PORT (default: 5440 — confirm matches your DB port)"
  echo "     - SMTP_USER + SMTP_PASS (Gmail app password for notifications)"
  echo ""
  read -p "  Press ENTER after you've edited the .env file..."
fi
echo ""

# ── Step 4: Configure rclone for Google Drive ────────────────
echo "[4/6] Configuring rclone for Google Drive..."
if rclone listremotes 2>/dev/null | grep -q "^gdrive:"; then
  echo "  ✓ rclone remote 'gdrive' already configured."
  echo "  Testing connection..."
  if rclone lsd gdrive: --max-depth 1 >/dev/null 2>&1; then
    echo "  ✓ Connection works."
  else
    echo "  ⚠️  Connection failed. Re-run: rclone config reconnect gdrive:"
  fi
else
  echo ""
  echo "  ─────────────────────────────────────────────────────"
  echo "  rclone will now ask you to authorize Google Drive."
  echo "  IMPORTANT:"
  echo "    - When asked for 'name', type:  gdrive"
  echo "    - When asked for 'storage', type: drive"
  echo "    - For 'client_id' and 'client_secret', press ENTER (use default)"
  echo "    - For 'scope', type: 1 (Full access)"
  echo "    - For 'service_account_file', press ENTER (skip)"
  echo "    - For 'Edit advanced config', type: n"
  echo "    - For 'Use auto config', type: n  (because this is a headless server)"
  echo "    - It will print a URL — open it in YOUR LAPTOP browser, log in to"
  echo "      bditengineer@gmail.com, allow access, then paste the verification"
  echo "      code back into this terminal."
  echo "    - For 'Configure this as a Shared Drive (Team Drive)', type: n"
  echo "    - Confirm with: y"
  echo "    - Then 'q' to quit."
  echo "  ─────────────────────────────────────────────────────"
  echo ""
  read -p "  Press ENTER to start rclone config..."
  rclone config
fi
echo ""

# ── Step 5: Cron job ─────────────────────────────────────────
echo "[5/6] Setting up daily cron job (runs every day at 02:00 server time)..."
CRON_LINE="0 2 * * * ${INSTALL_DIR}/backup.sh >> ${LOG_DIR}/cron.log 2>&1"
( crontab -l 2>/dev/null | grep -v "${INSTALL_DIR}/backup.sh" ; echo "${CRON_LINE}" ) | crontab -
echo "  ✓ Cron job installed."
echo "  Current crontab:"
crontab -l | grep tileserp-backup || true
echo ""

# ── Step 6: Test run ─────────────────────────────────────────
echo "[6/6] Running ONE test backup now..."
echo "  (This may take 30-60 seconds depending on DB size)"
echo ""
if bash "${INSTALL_DIR}/backup.sh"; then
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  ✅ SUCCESS! Backup uploaded to Google Drive."
  echo ""
  echo "  Check your Drive:"
  echo "    https://drive.google.com/drive/my-drive"
  echo "    → Folder: TilesERP-Backups/postgresql/tilessaas/$(date +%Y-%m-%d)/"
  echo ""
  echo "  Daily backups will run automatically at 02:00 every night."
  echo "  Old backups (>1 day) are auto-deleted from both VPS and Drive."
  echo ""
  echo "  Notification email goes to: bditengineer@gmail.com"
  echo "═══════════════════════════════════════════════════════════"
else
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  ❌ Test backup FAILED."
  echo "  Check log: ${LOG_DIR}/"
  echo "  Run manually to see error:  bash ${INSTALL_DIR}/backup.sh"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
