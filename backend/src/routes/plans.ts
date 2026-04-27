/**
 * /api/plans — public list (for landing page) + super_admin CRUD.
 *
 * Powers both the marketing site pricing section and the Super Admin
 * "Plans" management screen so they always stay in sync.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const router = Router();

function rowToPlan(r: any) {
  return {
    id: r.id,
    name: r.name,
    monthly_price: Number(r.price_monthly ?? 0),
    yearly_price: Number(r.price_yearly ?? 0),
    max_users: Number(r.max_users ?? 1),
    sms_enabled: !!r.sms_enabled,
    email_enabled: !!r.email_enabled,
    daily_summary_enabled: !!r.daily_summary_enabled,
    is_trial: !!r.is_trial,
    trial_days: Number(r.trial_days ?? 0),
    is_active: !!r.is_active,
    sort_order: Number(r.sort_order ?? 0),
    features: Array.isArray(r.features)
      ? r.features
      : (typeof r.features === 'string' ? safeJsonArray(r.features) : []),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

// ── Public: list active plans for landing page ────────────────────────────
router.get('/public', async (_req: Request, res: Response) => {
  try {
    const rows = await db('plans').where({ is_active: true }).orderBy('sort_order', 'asc').orderBy('price_monthly', 'asc');
    res.json({ plans: rows.map(rowToPlan) });
  } catch (err: any) {
    console.error('[plans:public] failed:', err);
    res.status(500).json({ error: err.message || 'Failed to load plans' });
  }
});

// ── Super Admin only routes ───────────────────────────────────────────────
router.use(authenticate, requireRole('super_admin'));

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db('plans').orderBy('sort_order', 'asc').orderBy('price_monthly', 'asc');
    res.json({ plans: rows.map(rowToPlan) });
  } catch (err: any) {
    console.error('[plans:list] failed:', err);
    res.status(500).json({ error: err.message || 'Failed to load plans' });
  }
});

const planSchema = z.object({
  name: z.string().trim().min(1).max(100),
  monthly_price: z.coerce.number().min(0),
  yearly_price: z.coerce.number().min(0),
  max_users: z.coerce.number().int().min(1),
  sms_enabled: z.boolean().optional().default(false),
  email_enabled: z.boolean().optional().default(false),
  daily_summary_enabled: z.boolean().optional().default(false),
  is_trial: z.boolean().optional().default(false),
  trial_days: z.coerce.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
  sort_order: z.coerce.number().int().optional().default(0),
  features: z.array(z.string().trim().min(1)).optional().default([]),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = planSchema.parse(req.body || {});
    const [row] = await db('plans')
      .insert({
        name: body.name,
        price_monthly: body.monthly_price,
        price_yearly: body.yearly_price,
        max_users: body.max_users,
        sms_enabled: body.sms_enabled,
        email_enabled: body.email_enabled,
        daily_summary_enabled: body.daily_summary_enabled,
        is_trial: body.is_trial,
        trial_days: body.trial_days,
        is_active: body.is_active,
        sort_order: body.sort_order,
        features: JSON.stringify(body.features),
      })
      .returning('*');
    res.status(201).json({ plan: rowToPlan(row) });
  } catch (err: any) {
    if (err?.issues) {
      res.status(400).json({ error: err.issues[0]?.message || 'Invalid plan data' });
      return;
    }
    if (err?.code === '23505') {
      res.status(409).json({ error: 'A plan with this name already exists' });
      return;
    }
    console.error('[plans:create] failed:', err);
    res.status(500).json({ error: err.message || 'Failed to create plan' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const body = planSchema.partial().parse(req.body || {});
    const patch: Record<string, any> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.monthly_price !== undefined) patch.price_monthly = body.monthly_price;
    if (body.yearly_price !== undefined) patch.price_yearly = body.yearly_price;
    if (body.max_users !== undefined) patch.max_users = body.max_users;
    if (body.sms_enabled !== undefined) patch.sms_enabled = body.sms_enabled;
    if (body.email_enabled !== undefined) patch.email_enabled = body.email_enabled;
    if (body.daily_summary_enabled !== undefined) patch.daily_summary_enabled = body.daily_summary_enabled;
    if (body.is_trial !== undefined) patch.is_trial = body.is_trial;
    if (body.trial_days !== undefined) patch.trial_days = body.trial_days;
    if (body.is_active !== undefined) patch.is_active = body.is_active;
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
    if (body.features !== undefined) patch.features = JSON.stringify(body.features);
    patch.updated_at = new Date();

    const [row] = await db('plans').where({ id: req.params.id }).update(patch).returning('*');
    if (!row) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    res.json({ plan: rowToPlan(row) });
  } catch (err: any) {
    if (err?.issues) {
      res.status(400).json({ error: err.issues[0]?.message || 'Invalid plan data' });
      return;
    }
    if (err?.code === '23505') {
      res.status(409).json({ error: 'A plan with this name already exists' });
      return;
    }
    console.error('[plans:update] failed:', err);
    res.status(500).json({ error: err.message || 'Failed to update plan' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const used = await db('subscriptions').where({ plan_id: req.params.id }).first();
    if (used) {
      res.status(409).json({ error: 'Cannot delete plan in use by a subscription. Mark it inactive instead.' });
      return;
    }
    const n = await db('plans').where({ id: req.params.id }).del();
    if (!n) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('[plans:delete] failed:', err);
    res.status(500).json({ error: err.message || 'Failed to delete plan' });
  }
});

export default router;
