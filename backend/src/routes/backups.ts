/**
 * /api/backups — Super Admin only.
 *
 * Provides VPS-side backup operations:
 *   - GET  /                       List backup_logs (paged, filtered)
 *   - GET  /restores               List restore_logs
 *   - POST /run                    Trigger manual backup script on VPS
 *   - GET  /drive                  List backup files available in Google Drive (via rclone)
 *   - POST /restore                Restore from a Google Drive backup file
 *
 * Shell-out targets (already present on the VPS):
 *   /opt/tileserp-backup/backup.sh   — full daily backup script
 *   /opt/tileserp-backup/restore.sh  — restore script (type, db, remote_path)
 *
 * Google Drive listing uses rclone remote 'gdrive:' configured per
 * mem://infrastructure/automated-backup-restore.
 */
import { Router, Request, Response } from 'express';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const execAsync = promisify(exec);
const router = Router();

router.use(authenticate, requireRole('super_admin'));

const BACKUP_SCRIPT = process.env.BACKUP_SCRIPT_PATH || '/opt/tileserp-backup/backup.sh';
const RESTORE_SCRIPT = process.env.RESTORE_SCRIPT_PATH || '/opt/tileserp-backup/restore.sh';
const RCLONE_REMOTE = process.env.RCLONE_REMOTE || 'gdrive:tileserp-backups';

// ─────────────────────────────────────────────────────────────────────
// GET /api/backups — list backup history
// ─────────────────────────────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.raw(
      `SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 200`,
    );
    res.json({ backups: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/backups/restores — list restore history
// ─────────────────────────────────────────────────────────────────────
router.get('/restores', async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.raw(
      `SELECT * FROM restore_logs ORDER BY created_at DESC LIMIT 100`,
    );
    res.json({ restores: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/backups/run — trigger manual backup
// body: { type?: 'postgresql' | 'mysql' | 'mongodb' | 'all' }
// ─────────────────────────────────────────────────────────────────────
const runSchema = z.object({
  type: z.enum(['postgresql', 'mysql', 'mongodb', 'all']).default('all'),
});

router.post('/run', async (req: Request, res: Response) => {
  const parsed = runSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const { type } = parsed.data;

  try {
    // Insert pending log row immediately so the UI can show "running"
    const startedAt = new Date().toISOString();
    const initiator = req.user?.email || 'super_admin';

    // Spawn detached so the HTTP response returns quickly.
    const child = spawn('bash', [BACKUP_SCRIPT, type], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, BACKUP_INITIATOR: initiator },
    });
    child.unref();

    return res.json({
      ok: true,
      message: `Manual ${type} backup started. Check Backup History in ~1-2 minutes.`,
      started_at: startedAt,
      pid: child.pid,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to start backup: ${err.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/backups/drive?type=postgresql|mysql|mongodb
// Lists backup files in Google Drive via rclone
// ─────────────────────────────────────────────────────────────────────
router.get('/drive', async (req: Request, res: Response) => {
  const type = (req.query.type as string) || '';
  const subPath = type ? `/${type}` : '';

  try {
    const cmd = `rclone lsjson ${RCLONE_REMOTE}${subPath} --recursive --files-only --no-modtime=false`;
    const { stdout } = await execAsync(cmd, { maxBuffer: 20 * 1024 * 1024, timeout: 60_000 });

    const files = JSON.parse(stdout || '[]') as Array<{
      Path: string;
      Name: string;
      Size: number;
      ModTime: string;
    }>;

    // Sort newest first
    files.sort((a, b) => (b.ModTime || '').localeCompare(a.ModTime || ''));

    return res.json({
      remote: `${RCLONE_REMOTE}${subPath}`,
      count: files.length,
      files: files.map((f) => ({
        path: f.Path,
        name: f.Name,
        size: f.Size,
        modified_at: f.ModTime,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'Failed to list Google Drive backups',
      detail: err.message,
      hint:
        'Ensure rclone is installed and the remote is configured. ' +
        `Current remote: ${RCLONE_REMOTE}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/backups/restore — restore from Google Drive
// body: { type, database_name, remote_path, app_name?, confirm }
// `confirm` must equal the database_name as a safety check.
// ─────────────────────────────────────────────────────────────────────
const restoreSchema = z.object({
  type: z.enum(['postgresql', 'mysql', 'mongodb']),
  database_name: z.string().min(1),
  remote_path: z.string().min(1),
  app_name: z.string().optional().default('unknown'),
  confirm: z.string().min(1),
});

router.post('/restore', async (req: Request, res: Response) => {
  const parsed = restoreSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const { type, database_name, remote_path, app_name, confirm } = parsed.data;

  if (confirm !== database_name) {
    return res.status(400).json({
      error: `Confirmation must equal database name "${database_name}".`,
    });
  }

  // 1. Insert restore log row (pending)
  let restoreId: string;
  try {
    const { rows } = await db.raw(
      `INSERT INTO restore_logs
         (backup_file_name, backup_type, database_name, app_name,
          initiated_by, initiated_by_name, status, logs)
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?)
       RETURNING id`,
      [
        remote_path,
        type,
        database_name,
        app_name,
        req.user?.userId || null,
        req.user?.email || 'super_admin',
        `Restore initiated at ${new Date().toISOString()} from ${RCLONE_REMOTE}/${remote_path}`,
      ],
    );
    restoreId = rows[0].id;
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to log restore: ${err.message}` });
  }

  // 2. Spawn restore script asynchronously
  try {
    const child = spawn('bash', [RESTORE_SCRIPT, type, database_name, remote_path], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, RESTORE_LOG_ID: restoreId },
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    child.stdout?.on('data', (d) => (stdoutBuf += d.toString()));
    child.stderr?.on('data', (d) => (stderrBuf += d.toString()));

    child.on('close', async (code) => {
      const status = code === 0 ? 'success' : 'failed';
      const logs = `EXIT ${code}\n--- STDOUT ---\n${stdoutBuf}\n--- STDERR ---\n${stderrBuf}`.slice(
        0,
        50_000,
      );
      try {
        await db.raw(
          `UPDATE restore_logs
              SET status = ?,
                  error_message = CASE WHEN ? = 'failed' THEN ? ELSE NULL END,
                  logs = ?
            WHERE id = ?`,
          [status, status, stderrBuf.slice(0, 5000) || null, logs, restoreId],
        );
      } catch (e) {
        console.error('[backups] Failed to update restore log', e);
      }
    });

    child.unref();

    return res.json({
      ok: true,
      restore_id: restoreId,
      message: `Restore started for ${database_name}. Status will update in a few minutes.`,
    });
  } catch (err: any) {
    await db
      .raw(
        `UPDATE restore_logs SET status = 'failed', error_message = ? WHERE id = ?`,
        [err.message, restoreId],
      )
      .catch(() => {});
    return res.status(500).json({ error: `Failed to start restore: ${err.message}` });
  }
});

export default router;
