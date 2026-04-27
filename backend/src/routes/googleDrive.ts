/**
 * /api/google-drive — Per-user Google Drive OAuth for Super Admins.
 *
 * Flow (drive.file scope):
 *   1. GET  /auth-url        Returns the Google OAuth consent URL.
 *   2. GET  /callback        Google redirects here with ?code=... — we exchange
 *                            for tokens, store per super_admin user, then close
 *                            the popup.
 *   3. GET  /status          Returns { connected, email } for the current user.
 *   4. POST /disconnect      Revokes + deletes the stored token.
 *   5. POST /restore         Body: { file_id, file_name, type, database_name,
 *                                    confirm }. Downloads the picked file via
 *                            the user's access_token, saves it to a temp file,
 *                            then runs /opt/tileserp-backup/restore.sh.
 *
 * Note: drive.file scope means the app only sees files the user explicitly
 * opens via Google Picker (frontend). Existing rclone-uploaded backups are
 * NOT auto-listed — the admin picks them with the Picker UI.
 */
import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { z } from 'zod';
import { db } from '../db/connection';
import { env } from '../config/env';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const router = Router();

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const RESTORE_SCRIPT = process.env.RESTORE_SCRIPT_PATH || '/opt/tileserp-backup/restore.sh';

function getRedirectUri(): string {
  return (
    env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${env.APP_PUBLIC_URL || 'https://api.sanitileserp.com'}/api/google-drive/callback`
  );
}

function ensureConfigured(res: Response): boolean {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    res.status(500).json({
      error:
        'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.',
    });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/google-drive/auth-url
// Builds the Google OAuth consent URL. We include the user's id in `state`
// so the callback knows which super_admin to attach the token to (the
// callback itself is hit by Google, not the SPA, so it has no JWT).
// ─────────────────────────────────────────────────────────────────────
router.get('/auth-url', authenticate, requireRole('super_admin'), (req, res) => {
  if (!ensureConfigured(res)) return;

  const userId = req.user!.userId;
  const state = Buffer.from(JSON.stringify({ uid: userId, t: Date.now() })).toString(
    'base64url',
  );

  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  res.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/google-drive/callback?code=...&state=...
// Public (no JWT) — Google redirects the browser here.
// ─────────────────────────────────────────────────────────────────────
router.get('/callback', async (req: Request, res: Response) => {
  const code = (req.query.code as string) || '';
  const state = (req.query.state as string) || '';
  const error = (req.query.error as string) || '';

  const renderClose = (ok: boolean, msg: string) => {
    res
      .status(ok ? 200 : 400)
      .type('html')
      .send(`<!doctype html><html><body style="font-family:sans-serif;background:#0f172a;color:#fff;padding:32px;text-align:center">
<h2>${ok ? '✅ Google Drive Connected' : '❌ Connection Failed'}</h2>
<p>${msg}</p>
<p>You can close this window.</p>
<script>
  try { window.opener && window.opener.postMessage({type:'gdrive_oauth', ok:${ok}, message:${JSON.stringify(msg)}}, '*'); } catch(e){}
  setTimeout(function(){ window.close(); }, 1500);
</script></body></html>`);
  };

  if (error) return renderClose(false, `Google returned: ${error}`);
  if (!code || !state) return renderClose(false, 'Missing code or state.');
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return renderClose(false, 'OAuth not configured on server.');
  }

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    userId = decoded.uid;
    if (!userId) throw new Error('no uid');
  } catch {
    return renderClose(false, 'Invalid state.');
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        redirect_uri: getRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    const tokens: any = await tokenRes.json();
    if (!tokenRes.ok) {
      return renderClose(false, `Token exchange failed: ${tokens.error_description || tokens.error || 'unknown'}`);
    }

    // Fetch user email
    let googleEmail: string | null = null;
    try {
      const u = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (u.ok) {
        const j: any = await u.json();
        googleEmail = j.email || null;
      }
    } catch {/* ignore */}

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    await db.raw(
      `INSERT INTO public.google_drive_tokens
         (user_id, google_email, access_token, refresh_token, token_type, scope, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, now())
       ON CONFLICT (user_id) DO UPDATE SET
         google_email = EXCLUDED.google_email,
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, public.google_drive_tokens.refresh_token),
         token_type = EXCLUDED.token_type,
         scope = EXCLUDED.scope,
         expires_at = EXCLUDED.expires_at,
         updated_at = now()`,
      [
        userId,
        googleEmail,
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.token_type || 'Bearer',
        tokens.scope || SCOPES.join(' '),
        expiresAt,
      ],
    );

    return renderClose(true, googleEmail ? `Connected as ${googleEmail}` : 'Connected.');
  } catch (err: any) {
    return renderClose(false, err.message || 'Unknown error');
  }
});

// All routes below require Super Admin auth
router.use(authenticate, requireRole('super_admin'));

// ─────────────────────────────────────────────────────────────────────
// GET /api/google-drive/status
// ─────────────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const { rows } = await db.raw(
      `SELECT google_email, expires_at, refresh_token IS NOT NULL AS has_refresh
         FROM public.google_drive_tokens WHERE user_id = ?`,
      [req.user!.userId],
    );
    const row = rows[0];
    res.json({
      connected: !!row,
      email: row?.google_email || null,
      expires_at: row?.expires_at || null,
      has_refresh: !!row?.has_refresh,
      configured: !!(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET),
      client_id: env.GOOGLE_OAUTH_CLIENT_ID || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/google-drive/disconnect
// ─────────────────────────────────────────────────────────────────────
router.post('/disconnect', async (req, res) => {
  try {
    const { rows } = await db.raw(
      `SELECT access_token, refresh_token FROM public.google_drive_tokens WHERE user_id = ?`,
      [req.user!.userId],
    );
    const tok = rows[0];
    if (tok) {
      // Best-effort revoke
      const t = tok.refresh_token || tok.access_token;
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, {
          method: 'POST',
        });
      } catch {/* ignore */}
    }
    await db.raw(`DELETE FROM public.google_drive_tokens WHERE user_id = ?`, [
      req.user!.userId,
    ]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Helper: get a fresh access token for the current user (refreshing if needed)
// ─────────────────────────────────────────────────────────────────────
async function getValidAccessToken(userId: string): Promise<string> {
  const { rows } = await db.raw(
    `SELECT access_token, refresh_token, expires_at
       FROM public.google_drive_tokens WHERE user_id = ?`,
    [userId],
  );
  const tok = rows[0];
  if (!tok) throw new Error('Google Drive not connected for this user');

  const expiresAt = new Date(tok.expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return tok.access_token;
  }
  // Refresh
  if (!tok.refresh_token) {
    throw new Error('Access token expired and no refresh token available — please reconnect');
  }
  const refRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: tok.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const j: any = await refRes.json();
  if (!refRes.ok) throw new Error(`Refresh failed: ${j.error_description || j.error}`);
  const newExp = new Date(Date.now() + (j.expires_in || 3600) * 1000);
  await db.raw(
    `UPDATE public.google_drive_tokens
       SET access_token = ?, expires_at = ?, updated_at = now()
       WHERE user_id = ?`,
    [j.access_token, newExp, userId],
  );
  return j.access_token;
}

// ─────────────────────────────────────────────────────────────────────
// POST /api/google-drive/restore
// body: { file_id, file_name, type, database_name, confirm }
// Downloads the file from Drive (using the user's access token), then runs
// the restore script. `confirm` must equal the database_name.
// ─────────────────────────────────────────────────────────────────────
const restoreSchema = z.object({
  file_id: z.string().min(1),
  file_name: z.string().min(1),
  type: z.enum(['postgresql', 'mysql', 'mongodb']),
  database_name: z.string().min(1),
  confirm: z.string().min(1),
  app_name: z.string().optional().default('drive-pick'),
});

router.post('/restore', async (req, res) => {
  const parsed = restoreSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { file_id, file_name, type, database_name, confirm, app_name } = parsed.data;

  if (confirm !== database_name) {
    return res
      .status(400)
      .json({ error: `Confirmation must equal database name "${database_name}".` });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(req.user!.userId);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  // Insert pending restore log
  let restoreId: string;
  try {
    const { rows } = await db.raw(
      `INSERT INTO public.restore_logs
         (backup_file_name, backup_type, database_name, app_name,
          initiated_by, initiated_by_name, status, logs)
       VALUES (?, ?, ?, ?, ?, ?, 'downloading', ?)
       RETURNING id`,
      [
        file_name,
        type,
        database_name,
        app_name,
        req.user!.userId,
        req.user!.email || 'super_admin',
        `Restore initiated at ${new Date().toISOString()} from Google Drive (file_id=${file_id})`,
      ],
    );
    restoreId = rows[0].id;
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to log restore: ${err.message}` });
  }

  // Kick off async download + restore — return response immediately
  res.json({
    ok: true,
    restore_id: restoreId,
    message: `Download + restore started for ${database_name}.`,
  });

  (async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'gdrive-restore-'));
    const localPath = join(tmpDir, file_name);
    try {
      // Download via Drive API
      const dlRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file_id)}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!dlRes.ok || !dlRes.body) {
        const txt = await dlRes.text().catch(() => '');
        throw new Error(`Drive download failed [${dlRes.status}]: ${txt.slice(0, 500)}`);
      }

      // Stream to file
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(localPath);
        // @ts-ignore — Node 18+ web stream → node stream
        const reader = (dlRes.body as any).getReader
          ? (dlRes.body as any)
          : null;
        if (reader && reader.getReader) {
          // Web stream
          (async () => {
            const r = (dlRes.body as any).getReader();
            try {
              while (true) {
                const { done, value } = await r.read();
                if (done) break;
                out.write(Buffer.from(value));
              }
              out.end();
              out.on('finish', resolve);
              out.on('error', reject);
            } catch (e) {
              reject(e);
            }
          })();
        } else {
          // Node stream
          (dlRes.body as any).pipe(out);
          out.on('finish', resolve);
          out.on('error', reject);
        }
      });

      await db.raw(
        `UPDATE public.restore_logs SET status = 'restoring',
           logs = logs || E'\\nDownloaded to ' || ? WHERE id = ?`,
        [localPath, restoreId],
      );

      // Spawn restore.sh local-file mode: pass the local path as the 3rd arg.
      // restore.sh must support: restore.sh <type> <db> <local_or_remote_path>
      const child = spawn('bash', [RESTORE_SCRIPT, type, database_name, localPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, RESTORE_LOG_ID: restoreId, RESTORE_SOURCE: 'local' },
      });

      let so = '';
      let se = '';
      child.stdout?.on('data', (d) => (so += d.toString()));
      child.stderr?.on('data', (d) => (se += d.toString()));

      child.on('close', async (code) => {
        const status = code === 0 ? 'success' : 'failed';
        const logs = `EXIT ${code}\n--- STDOUT ---\n${so}\n--- STDERR ---\n${se}`.slice(
          0,
          50_000,
        );
        try {
          await db.raw(
            `UPDATE public.restore_logs
               SET status = ?,
                   error_message = CASE WHEN ? = 'failed' THEN ? ELSE NULL END,
                   logs = logs || E'\\n' || ?
             WHERE id = ?`,
            [status, status, se.slice(0, 5000) || null, logs, restoreId],
          );
        } catch (e) {
          console.error('[google-drive] restore log update failed', e);
        }
        try {
          rmSync(tmpDir, { recursive: true, force: true });
        } catch {/* ignore */}
      });
    } catch (err: any) {
      await db
        .raw(
          `UPDATE public.restore_logs SET status = 'failed', error_message = ?,
             logs = logs || E'\\n' || ? WHERE id = ?`,
          [err.message, err.message, restoreId],
        )
        .catch(() => {});
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {/* ignore */}
    }
  })();
});

export default router;
