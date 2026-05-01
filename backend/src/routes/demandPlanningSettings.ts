/**
 * Demand Planning Settings route — Phase 3U-14.
 *
 *   GET   /api/demand-planning-settings?dealerId=
 *   PUT   /api/demand-planning-settings              body: { dealerId, ...settings }
 *   POST  /api/demand-planning-settings/reset        body: { dealerId }
 *
 * Reads open to authenticated dealer users; writes dealer_admin only.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';

const router = Router();
router.use(authenticate, tenantGuard);

const DEFAULTS = {
  velocity_window_days: 30,
  stockout_cover_days: 7,
  reorder_cover_days: 14,
  target_cover_days: 30,
  fast_moving_30d_qty: 20,
  slow_moving_30d_max: 5,
  dead_stock_days: 90,
  incoming_window_days: 30,
  safety_stock_days: 0,
};

const LIMITS = {
  velocity_window_days: { min: 7, max: 365 },
  stockout_cover_days: { min: 1, max: 60 },
  reorder_cover_days: { min: 1, max: 90 },
  target_cover_days: { min: 7, max: 180 },
  fast_moving_30d_qty: { min: 1, max: 100_000 },
  slow_moving_30d_max: { min: 0, max: 100_000 },
  dead_stock_days: { min: 14, max: 730 },
  incoming_window_days: { min: 7, max: 180 },
  safety_stock_days: { min: 0, max: 90 },
} as const;

function resolveDealer(req: Request, res: Response): string | null {
  const isSuper = req.user?.roles.includes('super_admin');
  const claimed =
    (req.query.dealerId as string | undefined) ||
    (req.body?.dealerId as string | undefined) ||
    undefined;
  if (isSuper) {
    if (!claimed) {
      res.status(400).json({ error: 'super_admin must specify dealerId' });
      return null;
    }
    return claimed;
  }
  if (!req.dealerId) {
    res.status(403).json({ error: 'No dealer assigned to your account' });
    return null;
  }
  if (claimed && claimed !== req.dealerId) {
    res.status(403).json({ error: 'dealerId mismatch' });
    return null;
  }
  return req.dealerId;
}

function requireAdmin(req: Request, res: Response): boolean {
  const roles = (req.user?.roles ?? []) as string[];
  if (!roles.includes('dealer_admin') && !roles.includes('super_admin')) {
    res.status(403).json({ error: 'Only dealer_admin can change planning settings' });
    return false;
  }
  return true;
}

const settingsSchema = z.object({
  velocity_window_days: z.number().int(),
  stockout_cover_days: z.number().int(),
  reorder_cover_days: z.number().int(),
  target_cover_days: z.number().int(),
  fast_moving_30d_qty: z.number().int(),
  slow_moving_30d_max: z.number().int(),
  dead_stock_days: z.number().int(),
  incoming_window_days: z.number().int(),
  safety_stock_days: z.number().int(),
});

function validate(s: z.infer<typeof settingsSchema>): string | null {
  for (const key of Object.keys(LIMITS) as Array<keyof typeof LIMITS>) {
    const v = s[key];
    const { min, max } = LIMITS[key];
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < min || v > max) {
      return `${String(key).replace(/_/g, ' ')} must be an integer between ${min} and ${max}`;
    }
  }
  if (s.stockout_cover_days >= s.reorder_cover_days)
    return 'Stockout cover days must be less than reorder cover days';
  if (s.reorder_cover_days > s.target_cover_days)
    return 'Reorder cover days cannot exceed target cover days';
  if (s.slow_moving_30d_max >= s.fast_moving_30d_qty)
    return 'Slow-moving threshold must be less than fast-moving threshold';
  return null;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const row = await db('demand_planning_settings').where({ dealer_id: dealerId }).first();
    res.json({ row: { dealer_id: dealerId, ...DEFAULTS, ...(row ?? {}) } });
  } catch (e: any) {
    console.error('[demand-planning-settings GET]', e.message);
    res.status(500).json({ error: 'Failed to load planning settings' });
  }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    if (!requireAdmin(req, res)) return;
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }
    const err = validate(parsed.data);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }
    const payload = { dealer_id: dealerId, ...parsed.data, updated_at: db.fn.now() };
    const [row] = await db('demand_planning_settings')
      .insert(payload)
      .onConflict('dealer_id')
      .merge(payload)
      .returning('*');
    res.json({ row });
  } catch (e: any) {
    console.error('[demand-planning-settings PUT]', e.message);
    res.status(500).json({ error: e.message || 'Failed to save planning settings' });
  }
});

router.post('/reset', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    if (!requireAdmin(req, res)) return;
    const payload = { dealer_id: dealerId, ...DEFAULTS, updated_at: db.fn.now() };
    const [row] = await db('demand_planning_settings')
      .insert(payload)
      .onConflict('dealer_id')
      .merge(payload)
      .returning('*');
    res.json({ row });
  } catch (e: any) {
    console.error('[demand-planning-settings/reset]', e.message);
    res.status(500).json({ error: e.message || 'Failed to reset planning settings' });
  }
});

export default router;
