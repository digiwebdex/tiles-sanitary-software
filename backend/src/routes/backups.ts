/**
 * /api/backups — Super Admin only.
 *
 * Manages three backup sources, all isolated to this project:
 *   - 'auto'      → daily script writes rows via service-key cURL
 *   - 'vps_local' → second copy stored under VPS_BACKUP_LOCAL_DIR
 *   - 'uploaded'  → manually uploaded by Super Admin via the UI
 *
 * Endpoints:
 *   GET    /                  List backup_logs (DB ∪ filesystem scan)
 *   GET    /restores          List restore_logs
 *   POST   /run               Trigger manual backup script + create vps_local copy
 *   GET    /drive             List backup files in Google Drive (rclone)
 *   POST   /restore           Restore from a Google Drive remote_path
 *   POST   /upload            Multipart upload (.sql.gz / .dump / .archive.gz)
 *   GET    /download/:id      Stream a vps_local or uploaded backup file
 *   POST   /restore-local     Restore from a vps_local or uploaded backup id
 *
 * Project isolation:
 *   All local files live under VPS_BACKUP_LOCAL_DIR (default
 *   /var/lib/tilessaas/backups). This dir is owned by this project only —
 *   never share with other apps on the VPS.
 */
import { Router, Request, Response } from 'express';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import crypto from 'crypto';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const execAsync = promisify(exec);
const router = Router();

router.use(authenticate, requireRole('super_admin'));

const BACKUP_SCRIPT = process.env.BACKUP_SCRIPT_PATH || '/opt/tileserp-backup/backup.sh';
const RESTORE_SCRIPT = process.env.RESTORE_SCRIPT_PATH || '/opt/tileserp-backup/restore.sh';
const RCLONE_REMOTE = process.env.RCLONE_REMOTE || 'gdrive:tileserp-backups';

// Project-isolated local backup directory (different from /opt/tileserp-backup
// which is the auto-script's working area). Override via env if needed.
const LOCAL_DIR = process.env.VPS_BACKUP_LOCAL_DIR || '/var/lib/tilessaas/backups';
const UPLOADS_SUBDIR = 'uploaded';
const VPS_LOCAL_SUBDIR = 'vps_local';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const ALLOWED_EXT = ['.sql.gz', '.dump', '.dump.gz', '.archive.gz', '.tar.gz'];

// ── Helpers ────────────────────────────────────────────────────────
async function ensureDir(p: string) {
  await fsp.mkdir(p, { recursive: true, mode: 0o750 });
}

async function sha256OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function hasAllowedExt(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
}

/**
 * Validate magic bytes — refuses obviously non-backup files.
 *  - gzip:        1F 8B
 *  - PG custom:   "PGDMP"
 *  - tar (ustar): bytes 257..262 == "ustar"
 */
async function isPlausibleBackup(filePath: string): Promise<boolean> {
  const fd = await fsp.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(512);
    const { bytesRead } = await fd.read(buf, 0, 512, 0);
    if (bytesRead < 5) return false;
    if (buf[0] === 0x1f && buf[1] === 0x8b) return true;            // gzip
    if (buf.slice(0, 5).toString('ascii') === 'PGDMP') return true;  // pg_dump custom
    if (bytesRead >= 263 && buf.slice(257, 262).toString('ascii') === 'ustar') return true;
    return false;
  } finally {
    await fd.close();
  }
}

function inferType(name: string): 'postgresql' | 'mysql' | 'mongodb' | 'unknown' {
  const lower = name.toLowerCase();
  if (lower.includes('postgres') || lower.includes('_pg_') || lower.endsWith('.dump')) return 'postgresql';
  if (lower.includes('mysql')) return 'mysql';
  if (lower.includes('mongo') || lower.endsWith('.archive.gz')) return 'mongodb';
  return 'unknown';
}

// ── Multer (writes to a temp file inside LOCAL_DIR) ────────────────
const uploadStorage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const dest = path.join(LOCAL_DIR, UPLOADS_SUBDIR);
    try {
      await ensureDir(dest);
      cb(null, dest);
    } catch (err: any) {
      cb(err, dest);
    }
  },
  filename: (_req, file, cb) => {
    // Sanitize: strip path separators + add timestamp prefix
    const safe = path.basename(file.originalname).replace(/[^A-Za-z0-9._-]/g, '_');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `upl_${ts}_${safe}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!hasAllowedExt(file.originalname)) {
      return cb(new Error('Unsupported file type. Allowed: ' + ALLOWED_EXT.join(', ')));
    }
    cb(null, true);
  },
});

// ── GET / — list backup_logs (and self-heal vps_local rows) ────────
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Best-effort filesystem reconciliation for vps_local + uploaded dirs.
    await reconcileLocalFiles().catch((e) => console.error('[backups] reconcile failed', e));

    const { rows } = await db.raw(
      `SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 300`,
    );
    return res.json({ backups: rows, local_dir: LOCAL_DIR });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /restores ─────────────────────────────────────────────────
router.get('/restores', async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.raw(
      `SELECT * FROM restore_logs ORDER BY created_at DESC LIMIT 200`,
    );
    return res.json({ restores: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /run — trigger manual backup ──────────────────────────────
const runSchema = z.object({
  type: z.enum(['postgresql', 'mysql', 'mongodb', 'all']).default('all'),
});

router.post('/run', async (req: Request, res: Response) => {
  const parsed = runSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  const { type } = parsed.data;
  const startedAt = new Date().toISOString();
  const initiator = req.user?.email || 'super_admin';
  const userId = (req.user as any)?.userId || null;

  try {
    const child = spawn('bash', [BACKUP_SCRIPT, type], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, BACKUP_INITIATOR: initiator },
    });
    child.unref();

    // Schedule a deferred VPS-local copy: a few minutes after the script
    // finishes, scan auto-backup dirs and copy newest dumps into LOCAL_DIR.
    setTimeout(() => {
      copyLatestAutoBackupsToLocal(userId, initiator).catch((e) =>
        console.error('[backups] vps_local copy failed', e),
      );
    }, 90_000);

    return res.json({
      ok: true,
      message: `Manual ${type} backup started. A VPS local copy will be created shortly.`,
      started_at: startedAt,
      pid: child.pid,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to start backup: ${err.message}` });
  }
});

// ── GET /drive ────────────────────────────────────────────────────
router.get('/drive', async (req: Request, res: Response) => {
  const type = (req.query.type as string) || '';
  const subPath = type ? `/${type}` : '';

  try {
    const cmd = `rclone lsjson ${RCLONE_REMOTE}${subPath} --recursive --files-only --no-modtime=false`;
    const { stdout } = await execAsync(cmd, { maxBuffer: 20 * 1024 * 1024, timeout: 60_000 });

    const files = JSON.parse(stdout || '[]') as Array<{
      Path: string; Name: string; Size: number; ModTime: string;
    }>;
    files.sort((a, b) => (b.ModTime || '').localeCompare(a.ModTime || ''));

    return res.json({
      remote: `${RCLONE_REMOTE}${subPath}`,
      count: files.length,
      files: files.map((f) => ({
        path: f.Path, name: f.Name, size: f.Size, modified_at: f.ModTime,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'Failed to list Google Drive backups',
      detail: err.message,
      hint: `Ensure rclone is installed and the remote is configured. Current remote: ${RCLONE_REMOTE}`,
    });
  }
});

// ── POST /restore — Google Drive restore (existing flow) ───────────
const restoreSchema = z.object({
  type: z.enum(['postgresql', 'mysql', 'mongodb']),
  database_name: z.string().min(1),
  remote_path: z.string().min(1),
  app_name: z.string().optional().default('unknown'),
  confirm: z.string().min(1),
  notes: z.string().optional(),
});

router.post('/restore', async (req: Request, res: Response) => {
  const parsed = restoreSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  const { type, database_name, remote_path, app_name, confirm, notes } = parsed.data;

  if (confirm !== database_name && confirm !== 'RESTORE') {
    return res.status(400).json({
      error: `Confirmation must equal "RESTORE" or the database name "${database_name}".`,
    });
  }

  const userId = (req.user as any)?.userId || null;
  const initiator = req.user?.email || 'super_admin';

  let restoreId: string;
  try {
    const { rows } = await db.raw(
      `INSERT INTO restore_logs
         (backup_file_name, backup_type, database_name, app_name,
          initiated_by, initiated_by_name, status, source, notes, logs)
       VALUES (?, ?, ?, ?, ?, ?, 'running', 'gdrive', ?, ?)
       RETURNING id`,
      [
        remote_path, type, database_name, app_name,
        userId, initiator, notes || null,
        `Restore initiated at ${new Date().toISOString()} from ${RCLONE_REMOTE}/${remote_path}`,
      ],
    );
    restoreId = rows[0].id;
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to log restore: ${err.message}` });
  }

  try {
    runRestoreScript(restoreId, [type, database_name, remote_path]);
    return res.json({
      ok: true, restore_id: restoreId,
      message: `Restore started for ${database_name}. Status will update in a few minutes.`,
    });
  } catch (err: any) {
    await db
      .raw(`UPDATE restore_logs SET status = 'failed', error_message = ? WHERE id = ?`,
        [err.message, restoreId])
      .catch(() => {});
    return res.status(500).json({ error: `Failed to start restore: ${err.message}` });
  }
});

// ── POST /upload — manual backup upload ────────────────────────────
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded (field name: "file").' });

  const userId = (req.user as any)?.userId || null;
  const uploaderName = req.user?.email || 'super_admin';
  const notes = (req.body?.notes as string) || null;
  const dbNameHint = (req.body?.database_name as string) || 'unknown';

  // Validate magic bytes
  let plausible = false;
  try { plausible = await isPlausibleBackup(file.path); } catch { plausible = false; }
  if (!plausible) {
    await fsp.unlink(file.path).catch(() => {});
    return res.status(400).json({
      error: 'Uploaded file does not look like a valid backup (gzip / pg_dump / tar header missing).',
    });
  }

  let checksum = '';
  try { checksum = await sha256OfFile(file.path); } catch { /* non-fatal */ }

  const inferred = inferType(file.originalname);
  try {
    const { rows } = await db.raw(
      `INSERT INTO backup_logs
         (backup_type, database_name, app_name, file_name, file_size,
          storage_location, status, source, local_path, checksum_sha256,
          created_by, created_by_name, notes, completed_at)
       VALUES (?, ?, ?, ?, ?, 'vps_local', 'uploaded', 'uploaded',
               ?, ?, ?, ?, ?, now())
       RETURNING id`,
      [
        inferred === 'unknown' ? 'postgresql' : inferred,
        dbNameHint,
        'manual-upload',
        file.originalname,
        file.size,
        file.path,
        checksum,
        userId,
        uploaderName,
        notes,
      ],
    );

    return res.json({
      ok: true,
      backup_id: rows[0].id,
      file_name: file.originalname,
      size: file.size,
      checksum_sha256: checksum,
      stored_at: file.path,
      message: 'Backup uploaded successfully.',
    });
  } catch (err: any) {
    await fsp.unlink(file.path).catch(() => {});
    return res.status(500).json({ error: `Failed to record upload: ${err.message}` });
  }
});

// Multer error handler (file too large, wrong type, etc.)
router.use((err: any, _req: Request, res: Response, next: any) => {
  if (err && (err.code || err instanceof multer.MulterError || err.message)) {
    return res.status(400).json({ error: err.message || 'Upload error' });
  }
  next(err);
});

// ── GET /download/:id — stream a local backup file ─────────────────
router.get('/download/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await db.raw(
      `SELECT id, file_name, local_path, source, file_size
         FROM backup_logs WHERE id = ? LIMIT 1`,
      [req.params.id],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Backup not found' });
    if (!row.local_path) {
      return res.status(400).json({ error: 'No local file available for this backup (Google Drive only).' });
    }
    if (!isPathInsideLocalDir(row.local_path)) {
      return res.status(403).json({ error: 'Refusing to serve file outside the project backup directory.' });
    }
    if (!fs.existsSync(row.local_path)) {
      return res.status(404).json({ error: 'File missing on disk.' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition',
      `attachment; filename="${(row.file_name || 'backup').replace(/"/g, '')}"`);
    fs.createReadStream(row.local_path).pipe(res);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /restore-local — restore from a vps_local / uploaded id ───
const restoreLocalSchema = z.object({
  backup_id: z.string().uuid(),
  database_name: z.string().min(1),
  type: z.enum(['postgresql', 'mysql', 'mongodb']).optional(),
  confirm: z.string().min(1),
  notes: z.string().optional(),
});

router.post('/restore-local', async (req: Request, res: Response) => {
  const parsed = restoreLocalSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  const { backup_id, database_name, confirm, notes } = parsed.data;
  let { type } = parsed.data;

  if (confirm !== 'RESTORE') {
    return res.status(400).json({ error: 'Type RESTORE to confirm.' });
  }

  // Look up the backup row
  const { rows: bRows } = await db.raw(
    `SELECT id, file_name, local_path, backup_type, source, app_name
       FROM backup_logs WHERE id = ? LIMIT 1`,
    [backup_id],
  );
  const backup = bRows[0];
  if (!backup) return res.status(404).json({ error: 'Backup not found' });
  if (!backup.local_path) return res.status(400).json({ error: 'This backup has no local file.' });
  if (!isPathInsideLocalDir(backup.local_path)) {
    return res.status(403).json({ error: 'Refusing to restore from a path outside the project backup directory.' });
  }
  if (!fs.existsSync(backup.local_path)) return res.status(404).json({ error: 'Backup file missing on disk.' });

  type = type || (backup.backup_type as any) || 'postgresql';

  const userId = (req.user as any)?.userId || null;
  const initiator = req.user?.email || 'super_admin';

  let restoreId: string;
  try {
    const { rows } = await db.raw(
      `INSERT INTO restore_logs
         (backup_log_id, backup_file_name, backup_type, database_name, app_name,
          initiated_by, initiated_by_name, status, source, notes, logs)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)
       RETURNING id`,
      [
        backup.id, backup.file_name, type, database_name, backup.app_name || 'unknown',
        userId, initiator, backup.source, notes || null,
        `Restore initiated at ${new Date().toISOString()} from local file ${backup.local_path}`,
      ],
    );
    restoreId = rows[0].id;
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to log restore: ${err.message}` });
  }

  try {
    runRestoreScript(restoreId, [type, database_name, backup.local_path]);
    return res.json({
      ok: true,
      restore_id: restoreId,
      message: `Restore started for ${database_name} from local file. Status updates in a few minutes.`,
    });
  } catch (err: any) {
    await db
      .raw(`UPDATE restore_logs SET status = 'failed', error_message = ? WHERE id = ?`,
        [err.message, restoreId])
      .catch(() => {});
    return res.status(500).json({ error: `Failed to start restore: ${err.message}` });
  }
});

// ── Internal: spawn restore script and update log on close ─────────
function runRestoreScript(restoreId: string, args: string[]) {
  const child = spawn('bash', [RESTORE_SCRIPT, ...args], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, RESTORE_LOG_ID: restoreId, RESTORE_AUTO_CONFIRM: 'RESTORE' },
  });

  let stdoutBuf = '';
  let stderrBuf = '';
  child.stdout?.on('data', (d) => (stdoutBuf += d.toString()));
  child.stderr?.on('data', (d) => (stderrBuf += d.toString()));

  child.on('close', async (code) => {
    const status = code === 0 ? 'success' : 'failed';
    const logs = `EXIT ${code}\n--- STDOUT ---\n${stdoutBuf}\n--- STDERR ---\n${stderrBuf}`.slice(0, 50_000);
    try {
      await db.raw(
        `UPDATE restore_logs
            SET status = ?,
                error_message = CASE WHEN ? = 'failed' THEN ? ELSE NULL END,
                logs = ?,
                completed_at = now()
          WHERE id = ?`,
        [status, status, stderrBuf.slice(0, 5000) || null, logs, restoreId],
      );
    } catch (e) {
      console.error('[backups] Failed to update restore log', e);
    }
  });

  // Pipe "RESTORE" into stdin so the script's interactive prompt passes.
  // (stdin is 'ignore' on this spawn — we rely on RESTORE_AUTO_CONFIRM env
  // and the restore.sh `read -r` line being adjusted to honor it.)
  child.unref();
}

// ── Internal: copy newest auto-backup dumps to LOCAL_DIR ───────────
const AUTO_BACKUP_DIR = process.env.BACKUP_BASE_DIR || '/opt/tileserp-backup/data';

async function copyLatestAutoBackupsToLocal(userId: string | null, who: string) {
  if (!fs.existsSync(AUTO_BACKUP_DIR)) return;
  const dest = path.join(LOCAL_DIR, VPS_LOCAL_SUBDIR);
  await ensureDir(dest);

  // Walk a couple of levels deep to find recent dump files (last 24h).
  const walk = async (dir: string, depth: number): Promise<string[]> => {
    if (depth < 0) return [];
    let out: string[] = [];
    let entries: fs.Dirent[];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out = out.concat(await walk(p, depth - 1));
      else if (hasAllowedExt(e.name)) out.push(p);
    }
    return out;
  };

  const recent = (await walk(AUTO_BACKUP_DIR, 4)).filter((f) => {
    try { return Date.now() - fs.statSync(f).mtimeMs < 24 * 60 * 60 * 1000; }
    catch { return false; }
  });

  for (const src of recent) {
    const base = path.basename(src);
    const out = path.join(dest, base);
    try {
      // Skip if already mirrored
      if (fs.existsSync(out)) continue;
      await fsp.copyFile(src, out);
      const size = (await fsp.stat(out)).size;
      const checksum = await sha256OfFile(out).catch(() => '');
      await db.raw(
        `INSERT INTO backup_logs
           (backup_type, database_name, app_name, file_name, file_size,
            storage_location, status, source, local_path, checksum_sha256,
            created_by, created_by_name, notes, completed_at)
         VALUES (?, ?, ?, ?, ?, 'vps_local', 'uploaded', 'vps_local',
                 ?, ?, ?, ?, ?, now())`,
        [
          inferType(base) === 'unknown' ? 'postgresql' : inferType(base),
          'mirror',
          'vps-local-copy',
          base,
          size,
          out,
          checksum,
          userId,
          who,
          'VPS local copy of automatic backup',
        ],
      );
    } catch (e) {
      console.error('[backups] copy/log failed for', src, e);
    }
  }
}

// ── Internal: reconcile filesystem with backup_logs ────────────────
async function reconcileLocalFiles() {
  const subdirs = [VPS_LOCAL_SUBDIR, UPLOADS_SUBDIR];
  for (const sub of subdirs) {
    const dir = path.join(LOCAL_DIR, sub);
    if (!fs.existsSync(dir)) continue;

    const entries = await fsp.readdir(dir);
    for (const name of entries) {
      const full = path.join(dir, name);
      try {
        const st = await fsp.stat(full);
        if (!st.isFile()) continue;

        const { rows } = await db.raw(
          `SELECT 1 FROM backup_logs WHERE local_path = ? LIMIT 1`,
          [full],
        );
        if (rows[0]) continue;

        const checksum = await sha256OfFile(full).catch(() => '');
        await db.raw(
          `INSERT INTO backup_logs
             (backup_type, database_name, app_name, file_name, file_size,
              storage_location, status, source, local_path, checksum_sha256,
              created_by_name, notes, completed_at)
           VALUES (?, ?, ?, ?, ?, 'vps_local', 'uploaded', ?,
                   ?, ?, 'system', 'Reconciled from filesystem', now())`,
          [
            inferType(name) === 'unknown' ? 'postgresql' : inferType(name),
            'mirror',
            sub === VPS_LOCAL_SUBDIR ? 'vps-local-copy' : 'manual-upload',
            name,
            st.size,
            'vps_local',
            sub === VPS_LOCAL_SUBDIR ? 'vps_local' : 'uploaded',
            full,
            checksum,
          ],
        );
      } catch (e) {
        console.error('[backups] reconcile error', name, e);
      }
    }
  }
}

function isPathInsideLocalDir(p: string): boolean {
  const resolved = path.resolve(p);
  const base = path.resolve(LOCAL_DIR);
  return resolved === base || resolved.startsWith(base + path.sep);
}

export default router;
