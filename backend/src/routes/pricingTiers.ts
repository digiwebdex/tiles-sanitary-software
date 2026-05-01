/**
 * Pricing Tiers route — Phase 3U-12.
 *
 *   GET    /api/pricing-tiers?dealerId=                       list tiers
 *   GET    /api/pricing-tiers/:id?dealerId=                   one tier
 *   POST   /api/pricing-tiers                                  create
 *   PATCH  /api/pricing-tiers/:id                              update
 *   DELETE /api/pricing-tiers/:id?dealerId=                    delete
 *   GET    /api/pricing-tiers/:id/items?dealerId=              list per-product rates
 *   PUT    /api/pricing-tiers/:id/items/:productId             upsert rate (body: { rate, dealerId })
 *   DELETE /api/pricing-tiers/:id/items/:productId?dealerId=   remove rate
 *   POST   /api/pricing-tiers/resolve                          batch resolve
 *                                                              body: { dealerId, productIds[], tierId? }
 *
 * dealer_admin can mutate; any authenticated user of the dealer may read +
 * resolve (sale forms need it to auto-fill rates).
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
    res.status(403).json({ error: 'Only dealer_admin can manage pricing tiers' });
    return false;
  }
  return true;
}

const tierWriteSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const rateUpsertSchema = z.object({
  rate: z.number().finite().min(0),
});

// ── GET /api/pricing-tiers ──
router.get('/', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const rows = await db('price_tiers')
      .select('*')
      .where({ dealer_id: dealerId })
      .orderBy('name');
    res.json({ rows });
  } catch (err: any) {
    console.error('[pricing-tiers/list]', err.message);
    res.status(500).json({ error: 'Failed to load pricing tiers' });
  }
});

// ── POST /api/pricing-tiers/resolve ──  (must come BEFORE /:id)
router.post('/resolve', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const productIds = Array.isArray(req.body?.productIds)
      ? (req.body.productIds as string[]).filter((x) => typeof x === 'string')
      : [];
    const tierId: string | null = req.body?.tierId ?? null;

    if (productIds.length === 0) {
      res.json({ items: {} });
      return;
    }

    const products = await db('products')
      .select('id', 'default_sale_rate')
      .where({ dealer_id: dealerId })
      .whereIn('id', productIds);
    const defaults = new Map<string, number>(
      products.map((p) => [p.id, Number(p.default_sale_rate ?? 0)]),
    );

    let tierActive = false;
    const tierRates = new Map<string, number>();
    if (tierId) {
      const tier = await db('price_tiers')
        .select('id', 'status', 'dealer_id')
        .where({ id: tierId, dealer_id: dealerId })
        .first();
      if (tier && tier.status === 'active') {
        tierActive = true;
        const items = await db('price_tier_items')
          .select('product_id', 'rate')
          .where({ tier_id: tierId })
          .whereIn('product_id', productIds);
        for (const it of items) tierRates.set(it.product_id, Number(it.rate));
      }
    }

    const items: Record<string, { rate: number; source: 'tier' | 'default'; tier_id: string | null }> = {};
    for (const pid of productIds) {
      const tierRate = tierActive ? tierRates.get(pid) : undefined;
      if (tierRate !== undefined) {
        items[pid] = { rate: tierRate, source: 'tier', tier_id: tierId };
      } else {
        items[pid] = { rate: defaults.get(pid) ?? 0, source: 'default', tier_id: null };
      }
    }
    res.json({ items });
  } catch (err: any) {
    console.error('[pricing-tiers/resolve]', err.message);
    res.status(500).json({ error: 'Failed to resolve prices' });
  }
});

// ── GET /api/pricing-tiers/:id ──
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const row = await db('price_tiers')
      .where({ id: req.params.id, dealer_id: dealerId })
      .first();
    if (!row) {
      res.status(404).json({ error: 'Tier not found' });
      return;
    }
    res.json({ row });
  } catch (err: any) {
    console.error('[pricing-tiers/get]', err.message);
    res.status(500).json({ error: 'Failed to load tier' });
  }
});

// ── POST /api/pricing-tiers ──
router.post('/', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    if (!requireAdmin(req, res)) return;
    const parsed = tierWriteSchema.safeParse(req.body);
    if (!parsed.success || !parsed.data.name) {
      res.status(400).json({ error: 'Tier name is required' });
      return;
    }
    try {
      const [row] = await db('price_tiers')
        .insert({
          dealer_id: dealerId,
          name: parsed.data.name.trim(),
          description: parsed.data.description?.toString().trim() || null,
          status: parsed.data.status ?? 'active',
          is_default: false,
        })
        .returning('*');
      res.status(201).json({ row });
    } catch (e: any) {
      if (e.code === '23505') {
        res.status(409).json({ error: 'A tier with this name already exists.' });
        return;
      }
      throw e;
    }
  } catch (err: any) {
    console.error('[pricing-tiers/create]', err.message);
    res.status(500).json({ error: 'Failed to create tier' });
  }
});

// ── PATCH /api/pricing-tiers/:id ──
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    if (!requireAdmin(req, res)) return;
    const parsed = tierWriteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
      return;
    }
    const update: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) update.name = parsed.data.name.trim();
    if (parsed.data.description !== undefined) {
      update.description = parsed.data.description?.toString().trim() || null;
    }
    if (parsed.data.status !== undefined) update.status = parsed.data.status;
    if (Object.keys(update).length === 0) {
      res.json({ row: null });
      return;
    }
    try {
      const [row] = await db('price_tiers')
        .where({ id: req.params.id, dealer_id: dealerId })
        .update({ ...update, updated_at: new Date() })
        .returning('*');
      if (!row) {
        res.status(404).json({ error: 'Tier not found' });
        return;
      }
      res.json({ row });
    } catch (e: any) {
      if (e.code === '23505') {
        res.status(409).json({ error: 'A tier with this name already exists.' });
        return;
      }
      throw e;
    }
  } catch (err: any) {
    console.error('[pricing-tiers/update]', err.message);
    res.status(500).json({ error: 'Failed to update tier' });
  }
});

// ── DELETE /api/pricing-tiers/:id ──
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    if (!requireAdmin(req, res)) return;
    const deleted = await db('price_tiers')
      .where({ id: req.params.id, dealer_id: dealerId })
      .delete();
    if (!deleted) {
      res.status(404).json({ error: 'Tier not found' });
      return;
    }
    res.status(204).end();
  } catch (err: any) {
    console.error('[pricing-tiers/delete]', err.message);
    res.status(500).json({ error: 'Failed to delete tier' });
  }
});

// ── GET /api/pricing-tiers/:id/items ──
router.get('/:id/items', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    // Make sure the tier belongs to this dealer first.
    const tier = await db('price_tiers')
      .select('id')
      .where({ id: req.params.id, dealer_id: dealerId })
      .first();
    if (!tier) {
      res.status(404).json({ error: 'Tier not found' });
      return;
    }
    const rows = await db('price_tier_items').select('*').where({ tier_id: req.params.id });
    res.json({ rows });
  } catch (err: any) {
    console.error('[pricing-tiers/items]', err.message);
    res.status(500).json({ error: 'Failed to load tier items' });
  }
});

// ── PUT /api/pricing-tiers/:id/items/:productId ──
router.put('/:id/items/:productId', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    if (!requireAdmin(req, res)) return;
    const parsed = rateUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid rate', issues: parsed.error.flatten() });
      return;
    }
    const tier = await db('price_tiers')
      .select('id')
      .where({ id: req.params.id, dealer_id: dealerId })
      .first();
    if (!tier) {
      res.status(404).json({ error: 'Tier not found' });
      return;
    }
    // Ensure product belongs to this dealer too.
    const product = await db('products')
      .select('id')
      .where({ id: req.params.productId, dealer_id: dealerId })
      .first();
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    await db('price_tier_items')
      .insert({
        dealer_id: dealerId,
        tier_id: req.params.id,
        product_id: req.params.productId,
        rate: parsed.data.rate,
      })
      .onConflict(['tier_id', 'product_id'])
      .merge({ rate: parsed.data.rate, updated_at: new Date() });
    res.status(204).end();
  } catch (err: any) {
    console.error('[pricing-tiers/items/upsert]', err.message);
    res.status(500).json({ error: 'Failed to save tier rate' });
  }
});

// ── DELETE /api/pricing-tiers/:id/items/:productId ──
router.delete('/:id/items/:productId', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    if (!requireAdmin(req, res)) return;
    const tier = await db('price_tiers')
      .select('id')
      .where({ id: req.params.id, dealer_id: dealerId })
      .first();
    if (!tier) {
      res.status(404).json({ error: 'Tier not found' });
      return;
    }
    await db('price_tier_items')
      .where({ tier_id: req.params.id, product_id: req.params.productId })
      .delete();
    res.status(204).end();
  } catch (err: any) {
    console.error('[pricing-tiers/items/delete]', err.message);
    res.status(500).json({ error: 'Failed to delete tier rate' });
  }
});

export default router;
