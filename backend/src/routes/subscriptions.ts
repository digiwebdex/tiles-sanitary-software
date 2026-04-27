import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const router = Router();

router.use(authenticate, requireRole('super_admin'));

function toDateOnly(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Reconciles subscription.status with end_date so the auth /me endpoint
 * always returns a status that matches reality. Suspended is sticky.
 */
function deriveStatus(currentStatus: string, endDateStr: string | null): 'active' | 'expired' | 'suspended' {
  if (currentStatus === 'suspended') return 'suspended';
  if (!endDateStr) return 'expired';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDateStr + 'T00:00:00');
  return today <= end ? 'active' : 'expired';
}

async function ensurePlan(planId?: string | null): Promise<string> {
  if (planId) return planId;
  let plan = await db('plans').where({ is_active: true }).orderBy('sort_order', 'asc').orderBy('price_monthly', 'asc').first();
  if (!plan) plan = await db('plans').orderBy('price_monthly', 'asc').first();
  if (!plan) {
    [plan] = await db('plans')
      .insert({ name: 'Basic', price_monthly: 0, price_yearly: 0, max_users: 1 })
      .returning('*');
  }
  return plan.id;
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db('subscriptions as s')
      .leftJoin('dealers as d', 'd.id', 's.dealer_id')
      .leftJoin('plans as p', 'p.id', 's.plan_id')
      .select(
        's.id', 's.dealer_id', 's.plan_id', 's.status', 's.billing_cycle',
        's.start_date', 's.end_date', 's.yearly_discount_applied', 's.created_at',
        'd.name as dealer_name', 'p.name as plan_name', 'p.price_monthly', 'p.price_yearly', 'p.max_users',
      )
      .orderBy('s.start_date', 'desc')
      .orderBy('s.created_at', 'desc');

    res.json({
      subscriptions: rows.map((r: any) => ({
        ...r,
        start_date: toDateOnly(r.start_date),
        end_date: toDateOnly(r.end_date),
        dealers: r.dealer_name ? { name: r.dealer_name } : null,
        plans: r.plan_name ? { id: r.plan_id, name: r.plan_name } : null,
      })),
    });
  } catch (err: any) {
    console.error('[subscriptions:list] failed:', err);
    res.status(500).json({ error: err.message || 'Failed to load subscriptions' });
  }
});

router.get('/lookups', async (_req: Request, res: Response) => {
  try {
    const [dealers, plans] = await Promise.all([
      db('dealers').select('id', 'name').whereIn('status', ['active', 'pending', 'suspended']).orderBy('name'),
      db('plans')
        .where({ is_active: true })
        .select('id', 'name', 'price_monthly', 'price_yearly', 'max_users')
        .orderBy('sort_order', 'asc')
        .orderBy('price_monthly', 'asc'),
    ]);
    res.json({ dealers, plans });
  } catch (err: any) {
    console.error('[subscriptions:lookups] failed:', err);
    res.status(500).json({ error: err.message || 'Failed to load subscription lookups' });
  }
});

const createSchema = z.object({
  dealer_id: z.string().uuid(),
  plan_id: z.string().uuid().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  status: z.enum(['active', 'expired', 'suspended']).default('active'),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = createSchema.parse(req.body || {});
    const planId = await ensurePlan(body.plan_id);

    // Default end_date based on plan trial_days if not provided
    let endDate = body.end_date;
    if (!endDate) {
      const plan = await db('plans').where({ id: planId }).first();
      const trialDays = Number(plan?.trial_days ?? 0);
      const days = trialDays > 0 ? trialDays : 30;
      const d = new Date();
      d.setDate(d.getDate() + days);
      endDate = d.toISOString().slice(0, 10);
    }

    const startDate = body.start_date || new Date().toISOString().slice(0, 10);
    const finalStatus = deriveStatus(body.status, endDate);

    const [row] = await db('subscriptions')
      .insert({
        dealer_id: body.dealer_id,
        plan_id: planId,
        start_date: startDate,
        end_date: endDate,
        status: finalStatus,
      })
      .returning('*');

    // Activate dealer + admin user so login works immediately
    await db('dealers').where({ id: body.dealer_id }).update({ status: 'active', updated_at: new Date() });
    const adminProfile = await db('profiles').where({ dealer_id: body.dealer_id }).first();
    if (adminProfile) {
      await db('users').where({ id: adminProfile.id }).update({ status: 'active', updated_at: new Date() });
      // Force token refresh on next request so subscription is picked up
      // Refresh tokens left intact; access token will pick up the new subscription via /me on next request.
    }

    res.status(201).json({ subscription: row });
  } catch (err: any) {
    if (err?.issues) {
      res.status(400).json({ error: err.issues[0]?.message || 'Invalid subscription data' });
      return;
    }
    console.error('[subscriptions:create] failed:', err);
    res.status(500).json({ error: err.message || 'Failed to create subscription' });
  }
});

const updateSchema = z.object({
  plan_id: z.string().uuid().optional(),
  end_date: z.string().optional().nullable(),
  status: z.enum(['active', 'expired', 'suspended']).optional(),
  billing_cycle: z.enum(['monthly', 'yearly']).optional(),
  yearly_discount_applied: z.boolean().optional(),
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const body = updateSchema.parse(req.body || {});
    const patch: Record<string, any> = { ...body };
    if (patch.end_date === '') patch.end_date = null;

    const existing = await db('subscriptions').where({ id: req.params.id }).first();
    if (!existing) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }

    const newEnd = patch.end_date !== undefined ? toDateOnly(patch.end_date) : toDateOnly(existing.end_date);
    const baseStatus = patch.status ?? existing.status;
    patch.status = deriveStatus(baseStatus, newEnd);

    const [row] = await db('subscriptions').where({ id: req.params.id }).update(patch).returning('*');

    // Activate dealer + admin and force token refresh so the dealer
    // app picks up the new subscription on next API call.
    if (patch.status === 'active') {
      await db('dealers').where({ id: existing.dealer_id }).update({ status: 'active', updated_at: new Date() });
      const adminProfile = await db('profiles').where({ dealer_id: existing.dealer_id }).first();
      if (adminProfile) {
        await db('users').where({ id: adminProfile.id }).update({ status: 'active', updated_at: new Date() });
        // Refresh tokens left intact; access token will pick up the new subscription via /me on next request.
      }
    }

    res.json({ subscription: row });
  } catch (err: any) {
    if (err?.issues) {
      res.status(400).json({ error: err.issues[0]?.message || 'Invalid subscription data' });
      return;
    }
    console.error('[subscriptions:update] failed:', err);
    res.status(500).json({ error: err.message || 'Failed to update subscription' });
  }
});

export default router;
