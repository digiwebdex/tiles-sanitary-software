/**
 * Campaign Gifts route — Phase 3U-14.
 *
 *   GET    /api/campaign-gifts?dealerId=
 *   POST   /api/campaign-gifts                  body: gift fields
 *   PATCH  /api/campaign-gifts/:id              body: { dealerId, paid_amount?, payment_status? }
 *   DELETE /api/campaign-gifts/:id?dealerId=
 *
 * dealer_admin only (matches RLS).
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';

const router = Router();
router.use(authenticate, tenantGuard);

function resolveDealer(req: Request, res: Response): string | null {
  const isSuper = req.user?.roles.includes('super_admin');
  const claimed =
    (req.query.dealerId as string | undefined) ||
    (req.body?.dealerId as string | undefined) ||
    (req.body?.dealer_id as string | undefined) ||
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
    res.status(403).json({ error: 'Only dealer_admin can manage campaign gifts' });
    return false;
  }
  return true;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const raw = await db('campaign_gifts as g')
      .leftJoin('customers as c', 'c.id', 'g.customer_id')
      .where('g.dealer_id', dealerId)
      .orderBy('g.created_at', 'desc')
      .select('g.*', 'c.name as c_name');
    const rows = raw.map((r: any) => {
      const { c_name, ...rest } = r;
      return { ...rest, customers: c_name ? { name: c_name } : undefined };
    });
    res.json({ rows });
  } catch (e: any) {
    console.error('[campaign-gifts GET]', e.message);
    res.status(500).json({ error: 'Failed to load campaign gifts' });
  }
});

const createSchema = z.object({
  customer_id: z.string().uuid(),
  campaign_name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  gift_value: z.number().finite().min(0),
  paid_amount: z.number().finite().min(0).optional(),
  payment_status: z.string().trim().max(40).optional(),
  created_by: z.string().uuid().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    if (!requireAdmin(req, res)) return;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }
    const [row] = await db('campaign_gifts')
      .insert({
        dealer_id: dealerId,
        customer_id: parsed.data.customer_id,
        campaign_name: parsed.data.campaign_name,
        description: parsed.data.description ?? null,
        gift_value: parsed.data.gift_value,
        paid_amount: parsed.data.paid_amount ?? 0,
        payment_status: parsed.data.payment_status ?? 'pending',
        created_by: parsed.data.created_by ?? req.user?.userId ?? null,
      })
      .returning('*');
    res.status(201).json({ row });
  } catch (e: any) {
    console.error('[campaign-gifts POST]', e.message);
    res.status(500).json({ error: e.message || 'Failed to create campaign gift' });
  }
});

const updateSchema = z.object({
  paid_amount: z.number().finite().min(0).optional(),
  payment_status: z.string().trim().max(40).optional(),
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    if (!requireAdmin(req, res)) return;
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }
    const patch: Record<string, any> = {};
    if (parsed.data.paid_amount !== undefined) patch.paid_amount = parsed.data.paid_amount;
    if (parsed.data.payment_status !== undefined) patch.payment_status = parsed.data.payment_status;
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    const [row] = await db('campaign_gifts')
      .where({ id: req.params.id, dealer_id: dealerId })
      .update(patch)
      .returning('*');
    if (!row) {
      res.status(404).json({ error: 'Campaign gift not found' });
      return;
    }
    res.json({ row });
  } catch (e: any) {
    console.error('[campaign-gifts PATCH]', e.message);
    res.status(500).json({ error: e.message || 'Failed to update campaign gift' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    if (!requireAdmin(req, res)) return;
    const result = await db('campaign_gifts')
      .where({ id: req.params.id, dealer_id: dealerId })
      .del();
    if (!result) {
      res.status(404).json({ error: 'Campaign gift not found' });
      return;
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[campaign-gifts DELETE]', e.message);
    res.status(500).json({ error: e.message || 'Failed to delete campaign gift' });
  }
});

export default router;
