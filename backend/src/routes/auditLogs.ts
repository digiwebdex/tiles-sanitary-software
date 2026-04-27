/**
 * /api/audit-logs — server-side audit log endpoint.
 *
 * P1 fix: replaces client-side `supabase.from('audit_logs').insert()` calls
 * which were forgeable by anyone with an anon key. Writes are now bound to
 * the authenticated user (req.user.userId) and the resolved dealer
 * (req.dealerId) — clients cannot spoof either field.
 *
 * Endpoints:
 *   POST   /api/audit-logs               body: { action, table_name, record_id?, old_data?, new_data? }
 *   GET    /api/audit-logs?limit=50      list latest audit rows for the dealer (admin-only)
 *
 * The request IP and user-agent are captured server-side.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';
import { requireRole } from '../middleware/roles';

const router = Router();

router.use(authenticate, tenantGuard);

const writeSchema = z.object({
  action: z.string().trim().min(1).max(80),
  table_name: z.string().trim().min(1).max(80),
  record_id: z.string().uuid().nullable().optional(),
  old_data: z.record(z.unknown()).nullable().optional(),
  new_data: z.record(z.unknown()).nullable().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = writeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
      return;
    }

    // Trust ONLY the server-derived identity: never accept dealer_id or
    // user_id from the request body. This is the whole point of the fix.
    const dealerId = req.dealerId;
    const userId = req.user?.userId ?? null;
    if (!dealerId) {
      res.status(400).json({ error: 'No dealer scope for this request' });
      return;
    }

    // Capture IP (respect trust proxy) and UA server-side.
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      null;
    const ua = (req.headers['user-agent'] as string) || null;

    const [row] = await db('audit_logs')
      .insert({
        dealer_id: dealerId,
        user_id: userId,
        action: parsed.data.action,
        table_name: parsed.data.table_name,
        record_id: parsed.data.record_id ?? null,
        old_data: parsed.data.old_data ?? null,
        new_data: parsed.data.new_data ?? null,
        ip_address: ip,
        user_agent: ua,
      })
      .returning(['id', 'created_at']);

    res.status(201).json({ id: row.id, created_at: row.created_at });
  } catch (err: any) {
    console.error('[audit:write]', err.message);
    res.status(500).json({ error: 'Failed to record audit log' });
  }
});

// Admin-only list endpoint (super_admin or dealer_admin of the tenant).
router.get('/', requireRole('dealer_admin'), async (req: Request, res: Response) => {
  try {
    const dealerId = req.dealerId;
    if (!dealerId) {
      res.status(400).json({ error: 'No dealer scope' });
      return;
    }
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? 100), 10)));
    const rows = await db('audit_logs')
      .where({ dealer_id: dealerId })
      .orderBy('created_at', 'desc')
      .limit(limit);
    res.json({ rows });
  } catch (err: any) {
    console.error('[audit:list]', err.message);
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

export default router;
