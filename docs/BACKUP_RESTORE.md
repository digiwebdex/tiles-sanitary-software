# TilesERP — Automated Backup & Restore System

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  VPS (187.77.144.38)                │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ PostgreSQL │  │  MySQL     │  │  MongoDB     │  │
│  │  (5440)    │  │  (3306)    │  │  (27017)     │  │
│  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘  │
│        │               │                │          │
│  ┌─────▼───────────────▼────────────────▼───────┐  │
│  │           backup.sh (cron daily 2AM)         │  │
│  │  pg_dump / mysqldump / mongodump → gzip      │  │
│  └──────────────────┬───────────────────────────┘  │
│                     │                              │
│  ┌──────────────────▼───────────────────────────┐  │
│  │         rclone → Google Drive                │  │
│  │    TilesERP-Backups/{type}/{app}/{date}/      │  │
│  └──────────────────┬───────────────────────────┘  │
│                     │                              │
│  ┌──────────────────▼───────────────────────────┐  │
│  │    Log to Supabase (backup_logs table)        │  │
│  │    Email notification → bditengineer@gmail    │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │     restore.sh (manual / Super Admin UI)     │  │
│  │  Download from GDrive → validate → restore   │  │
│  │  Pre-restore safety backup (optional)        │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 1. Directory Structure on VPS

```
/opt/tileserp-backup/
├── .env                    # Credentials (chmod 600)
├── backup.sh               # Main backup script
├── restore.sh              # Restore script
├── detect-databases.sh     # Database detector
├── list-backups.sh         # List Google Drive backups
├── data/                   # Local backup storage
│   ├── postgresql/
│   │   └── tilessaas/
│   │       └── 2025-01-15/
│   ├── mysql/
│   └── mongodb/
├── logs/                   # Log files
│   ├── backup_2025-01-15_02-00-00.log
│   ├── restore_2025-01-15_10-30-00.log
│   └── cron.log
└── tmp/                    # Temporary downloads
```

---

## 2. Installation (VPS)

### Step 1: Install packages
```bash
sudo apt update && sudo apt install -y rclone mailutils postgresql-client gzip curl python3
```

### Step 2: Configure rclone for Google Drive
```bash
rclone config
# n → New remote
# Name: gdrive
# Storage: 13 (Google Drive)
# client_id: (leave blank for default)
# client_secret: (leave blank)
# scope: 1 (Full access)
# root_folder_id: (leave blank)
# service_account_file: (leave blank)
# Edit advanced config: n
# Auto config: 
#   If on headless server: n → follow link → paste auth code
#   If GUI available: y → browser opens
# Team Drive: n
# Confirm: y

# Test connection:
rclone lsd gdrive:
```

### Step 3: Deploy scripts
```bash
sudo mkdir -p /opt/tileserp-backup/{data,logs,tmp}
# Copy files from project repo:
sudo cp scripts/backup/backup.sh /opt/tileserp-backup/
sudo cp scripts/backup/restore.sh /opt/tileserp-backup/
sudo cp scripts/backup/detect-databases.sh /opt/tileserp-backup/
sudo cp scripts/backup/list-backups.sh /opt/tileserp-backup/
sudo cp scripts/backup/backup.env.example /opt/tileserp-backup/.env

# Set permissions
sudo chmod +x /opt/tileserp-backup/*.sh
sudo chmod 600 /opt/tileserp-backup/.env

# Edit credentials
sudo nano /opt/tileserp-backup/.env
```

### Step 4: Setup cron
```bash
sudo crontab -e
# Add:
0 2 * * * /opt/tileserp-backup/backup.sh >> /opt/tileserp-backup/logs/cron.log 2>&1
```

### Step 5: First test
```bash
# Detect databases
bash /opt/tileserp-backup/detect-databases.sh

# Run backup manually
sudo /opt/tileserp-backup/backup.sh

# Check results
cat /opt/tileserp-backup/logs/backup_*.log
rclone ls gdrive:TilesERP-Backups/
```

---

## 3. Google Drive Folder Structure
```
TilesERP-Backups/
├── postgresql/
│   └── tilessaas/
│       ├── 2025-01-14/
│       │   └── tilessaas_postgresql_tilessaas_2025-01-14_02-00-00.sql.gz
│       └── 2025-01-15/
│           └── tilessaas_postgresql_tilessaas_2025-01-15_02-00-00.sql.gz
├── mysql/
│   └── coolify-app/
│       └── 2025-01-15/
└── mongodb/
    └── coolify-app/
        └── 2025-01-15/
```

---

## 4. Retention Policy
| Type    | Duration    | Cleanup      |
|---------|-------------|--------------|
| Daily   | 30 days     | Auto (cron)  |
| Weekly  | 8 weeks     | Optional     |
| Latest  | Never delete until new backup confirmed |

---

## 5. Email Notifications

Sent to: `bditengineer@gmail.com`

| Event               | Subject Example                                           |
|----------------------|-----------------------------------------------------------|
| Success              | `[TilesERP-VPS] Backup SUCCESS - 2025-01-15_02-00-00`   |
| Partial Failure      | `[TilesERP-VPS] Backup PARTIAL FAILURE - ...`            |
| Skipped              | `[TilesERP-VPS] Backup SKIPPED - ...`                    |
| Restore Success      | `[TilesERP-VPS] Restore SUCCESS - ...`                   |
| Restore Failed       | `[TilesERP-VPS] Restore FAILED - ...`                    |

---

## 6. Restore Guide

### PostgreSQL
```bash
sudo /opt/tileserp-backup/restore.sh postgresql tilessaas \
  postgresql/tilessaas/2025-01-15/tilessaas_postgresql_tilessaas_2025-01-15_02-00-00.sql.gz
```

### MySQL
```bash
sudo /opt/tileserp-backup/restore.sh mysql mydb \
  mysql/coolify-app/2025-01-15/coolify-app_mysql_mydb_2025-01-15_02-00-00.sql.gz
```

### MongoDB
```bash
sudo /opt/tileserp-backup/restore.sh mongodb mydb \
  mongodb/coolify-app/2025-01-15/coolify-app_mongodb_mydb_2025-01-15_02-00-00.archive.gz
```

### From Super Admin Panel
1. Navigate to Super Admin → Backup & Restore
2. Find the backup in the table
3. Click "Restore" button
4. Type `RESTORE` to confirm
5. Copy the generated VPS command
6. Execute on VPS via SSH

---

## 7. Disaster Recovery Checklist

- [ ] Verify rclone can connect: `rclone lsd gdrive:`
- [ ] List available backups: `bash /opt/tileserp-backup/list-backups.sh`
- [ ] Select correct backup by date/time
- [ ] Take pre-restore safety backup (automatic unless `--no-safety-backup`)
- [ ] Execute restore with typed RESTORE confirmation
- [ ] Verify data: connect to database, check record counts
- [ ] Restart app: `pm2 restart tilessaas-api`
- [ ] Test app functionality in browser
- [ ] Check logs for errors

---

## 8. Credential Rotation

### Google Drive (rclone)
```bash
rclone config reconnect gdrive:
```

### Gmail App Password
1. Go to Google Account → Security → App Passwords
2. Generate new password
3. Update `/opt/tileserp-backup/.env` → `SMTP_PASS`

---

## 9. Troubleshooting

| Issue | Solution |
|-------|----------|
| Backup fails | Check logs: `tail -100 /opt/tileserp-backup/logs/backup_*.log` |
| rclone auth expired | `rclone config reconnect gdrive:` |
| Email not sent | Verify Gmail App Password, check `SMTP_*` in .env |
| Restore fails | Check DB is running, verify dump file integrity with `file dump.sql.gz` |
| Disk full | Clean old backups: `find /opt/tileserp-backup/data -mtime +7 -delete` |

---

## 10. Health Check Commands

```bash
# Check cron is running
sudo crontab -l | grep backup

# Check last backup log
ls -lt /opt/tileserp-backup/logs/ | head -5

# Check Google Drive backups
rclone ls gdrive:TilesERP-Backups/ | head -20

# Check disk usage
du -sh /opt/tileserp-backup/data/

# Verify backup file integrity
file /opt/tileserp-backup/data/postgresql/tilessaas/$(date +%Y-%m-%d)/*.gz
```
