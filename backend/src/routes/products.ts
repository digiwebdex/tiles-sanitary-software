/**
 * Products REST routes — Phase 3D.
 *
 * Mirrors suppliers/customers pattern:
 *   GET    /api/products?dealerId=&page=&pageSize=&search=&orderBy=&orderDir=&f.<col>=
 *   GET    /api/products/:id?dealerId=
 *   POST   /api/products           body: { dealerId, data }
 *   PATCH  /api/products/:id       body: { dealerId, data }
 *   DELETE /api/products/:id?dealerId=
 *
 * Safety:
 *   - authenticate JWT + tenantGuard on every route
 *   - Every query is scoped to dealer_id
 *   - super_admin must pass an explicit dealerId
 *   - Phase 3D = shadow mode only. Writes work but frontend never calls
 *     them; product writes stay on Supabase until shadow runs clean.
 *
 * Search semantics (mirrors legacy supabase OR-ilike on sku/name/barcode):
 *   ?search=foo → ILIKE name | ILIKE sku | ILIKE barcode
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';
import { requireRole, hasRole } from '../middleware/roles';

/**
 * Strip cost_price for users that lack 'dealer_admin' or 'super_admin'.
 * Salesmen MUST NOT see margins / cost data — enforced server-side.
 */
function stripCostForSalesman<T extends Record<string, any>>(req: Request, row: T | undefined): T | undefined {
  if (!row) return row;
  if (hasRole(req, 'dealer_admin') || hasRole(req, 'super_admin')) return row;
  const { cost_price: _omit, ...safe } = row;
  return safe as T;
}

const router = Router();
const TABLE = 'products';

const SORTABLE = new Set([
  'name',
  'sku',
  'created_at',
  'cost_price',
  'default_sale_rate',
  'reorder_level',
  'category',
]);

const FILTERABLE = new Set([
  'active',
  'category',
  'brand',
  'unit_type',
  'sku',
  'barcode',
]);

const WRITABLE = new Set([
  'sku',
  'barcode',
  'name',
  'category',
  'brand',
  'size',
  'color',
  'material',
  'weight',
  'warranty',
  'unit_type',
  'per_box_sft',
  'cost_price',
  'default_sale_rate',
  'reorder_level',
  'active',
  'image_url',
]);

const productWriteSchema = z.object({
  sku: z.string().trim().min(1).max(100).optional(),
  barcode: z.string().trim().max(100).nullable().optional(),
  name: z.string().trim().min(1).max(255).optional(),
  category: z.enum(['tiles', 'sanitary', 'tile', 'accessory']).optional(),
  brand: z.string().trim().max(100).nullable().optional(),
  size: z.string().trim().max(100).nullable().optional(),
  color: z.string().trim().max(100).nullable().optional(),
  material: z.string().trim().max(100).nullable().optional(),
  weight: z.string().trim().max(50).nullable().optional(),
  warranty: z.string().trim().max(100).nullable().optional(),
  unit_type: z.enum(['box_sft', 'piece']).optional(),
  per_box_sft: z.number().finite().nullable().optional(),
  cost_price: z.number().finite().min(0).optional(),
  default_sale_rate: z.number().finite().min(0).optional(),
  reorder_level: z.number().finite().min(0).optional(),
  active: z.boolean().optional(),
  image_url: z.string().trim().max(500).nullable().optional(),
});

function resolveDealerScope(req: Request, res: Response): string | null {
  const isSuperAdmin = req.user?.roles.includes('super_admin');
  const claimed =
    (req.query.dealerId as string | undefined) ||
    (req.body?.dealerId as string | undefined);

  if (isSuperAdmin) {
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

router.use(authenticate, tenantGuard);

// ── GET /api/products ──────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealerScope(req, res);
    if (!dealerId) return;

    const page = Math.max(0, parseInt((req.query.page as string) || '0', 10));
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt((req.query.pageSize as string) || '25', 10)),
    );
    const search = ((req.query.search as string) || '').trim();
    const orderBy = (req.query.orderBy as string) || 'created_at';
    const orderDir = ((req.query.orderDir as string) || 'desc').toLowerCase();

    let q = db(TABLE).where({ dealer_id: dealerId });

    for (const [key, value] of Object.entries(req.query)) {
      if (!key.startsWith('f.')) continue;
      const col = key.slice(2);
      if (!FILTERABLE.has(col)) continue;
      // Coerce booleans for `active`
      if (col === 'active') {
        q = q.andWhere(col, value === 'true');
      } else {
        q = q.andWhere(col, value as string);
      }
    }

    if (search) {
      q = q.andWhere(function () {
        this.whereILike('sku', `%${search}%`)
          .orWhereILike('name', `%${search}%`)
          .orWhereILike('barcode', `%${search}%`);
      });
    }

    const countQ = q
      .clone()
      .clearOrder()
      .clearSelect()
      .count<{ count: string }[]>('* as count');

    const sortCol = SORTABLE.has(orderBy) ? orderBy : 'created_at';
    const sortDir = orderDir === 'asc' ? 'asc' : 'desc';

    const rowsQ = q
      .clone()
      .select('*')
      .orderBy(sortCol, sortDir)
      .offset(page * pageSize)
      .limit(pageSize);

    const [countRow] = await countQ;
    const rawRows = await rowsQ;
    const rows = rawRows.map((r: any) => stripCostForSalesman(req, r));

    res.json({
      rows,
      total: Number(countRow?.count ?? 0),
    });
  } catch (err: any) {
    console.error('[products/list]', err.message);
    res.status(500).json({ error: 'Failed to list products' });
  }
});

// ── GET /api/products/cost-map ─────────────────────────────────────────────
// dealer_admin only — salesman blocked from cost data
router.get('/cost-map', requireRole('dealer_admin'), async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealerScope(req, res);
    if (!dealerId) return;
    const rows = await db('stock')
      .where({ dealer_id: dealerId })
      .select('product_id', 'average_cost_per_unit');
    const map: Record<string, number> = {};
    for (const s of rows as any[]) map[s.product_id] = Number(s.average_cost_per_unit) || 0;
    res.json({ rows: map });
  } catch (err: any) {
    console.error('[products/cost-map]', err.message);
    res.status(500).json({ error: 'Failed to load cost map' });
  }
});

// ── GET /api/products/last-cost-map ───────────────────────────────────────
// dealer_admin only — most-recent landed_cost per product
router.get('/last-cost-map', requireRole('dealer_admin'), async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealerScope(req, res);
    if (!dealerId) return;
    const rows = await db.raw(
      `
      SELECT pi.product_id, pi.landed_cost
      FROM purchase_items pi
      JOIN purchases p ON p.id = pi.purchase_id
      WHERE pi.dealer_id = ?
      ORDER BY p.purchase_date DESC, p.created_at DESC
      `,
      [dealerId],
    );
    const map: Record<string, number> = {};
    for (const r of (rows.rows ?? []) as any[]) {
      if (!(r.product_id in map)) map[r.product_id] = Number(r.landed_cost) || 0;
    }
    res.json({ rows: map });
  } catch (err: any) {
    console.error('[products/last-cost-map]', err.message);
    res.status(500).json({ error: 'Failed to load last-cost map' });
  }
});

// ── GET /api/products/tx-check ────────────────────────────────────────────
// Returns set of product ids that appear in any sale_items / purchase_items / sales_returns
router.get('/tx-check', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealerScope(req, res);
    if (!dealerId) return;
    const [sales, purchases, returns] = await Promise.all([
      db('sale_items').where({ dealer_id: dealerId }).distinct('product_id'),
      db('purchase_items').where({ dealer_id: dealerId }).distinct('product_id'),
      db('sales_returns').where({ dealer_id: dealerId }).distinct('product_id'),
    ]);
    const ids = new Set<string>();
    for (const r of [...sales, ...purchases, ...returns] as any[]) {
      if (r.product_id) ids.add(r.product_id);
    }
    res.json({ ids: Array.from(ids) });
  } catch (err: any) {
    console.error('[products/tx-check]', err.message);
    res.status(500).json({ error: 'Failed to load tx-check' });
  }
});

// ── GET /api/products/:id ──────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealerScope(req, res);
    if (!dealerId) return;

    const row = await db(TABLE)
      .where({ id: req.params.id, dealer_id: dealerId })
      .first();

    if (!row) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json({ row: stripCostForSalesman(req, row) });
  } catch (err: any) {
    console.error('[products/get]', err.message);
    res.status(500).json({ error: 'Failed to load product' });
  }
});

// ── POST /api/products ─────────────────────────────────────────────────────
// P0: dealer_admin / super_admin only. Salesmen cannot create products.
router.post('/', requireRole('dealer_admin'), async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealerScope(req, res);
    if (!dealerId) return;

    const parsed = productWriteSchema.safeParse(req.body?.data);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'Invalid payload', issues: parsed.error.flatten() });
      return;
    }
    if (!parsed.data.sku || !parsed.data.name || !parsed.data.category) {
      res.status(400).json({ error: 'sku, name, category are required' });
      return;
    }

    const payload: Record<string, unknown> = {
      dealer_id: dealerId,
      // Auto-generate barcode from SKU to mirror legacy productService.create
      barcode: parsed.data.barcode ?? parsed.data.sku,
    };
    for (const k of Object.keys(parsed.data)) {
      if (WRITABLE.has(k)) payload[k] = (parsed.data as any)[k];
    }

    const [row] = await db(TABLE).insert(payload).returning('*');
    res.status(201).json({ row });
  } catch (err: any) {
    if (err?.code === '23505') {
      res.status(409).json({ error: 'A product with this SKU already exists.' });
      return;
    }
    console.error('[products/create]', err.message);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// ── PATCH /api/products/:id ────────────────────────────────────────────────
router.patch('/:id', requireRole('dealer_admin'), async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealerScope(req, res);
    if (!dealerId) return;

    const parsed = productWriteSchema.safeParse(req.body?.data);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'Invalid payload', issues: parsed.error.flatten() });
      return;
    }

    const payload: Record<string, unknown> = {};
    for (const k of Object.keys(parsed.data)) {
      if (WRITABLE.has(k)) payload[k] = (parsed.data as any)[k];
    }

    if (Object.keys(payload).length === 0) {
      res.status(400).json({ error: 'No editable fields supplied' });
      return;
    }

    const [row] = await db(TABLE)
      .where({ id: req.params.id, dealer_id: dealerId })
      .update(payload)
      .returning('*');

    if (!row) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json({ row });
  } catch (err: any) {
    if (err?.code === '23505') {
      res.status(409).json({ error: 'A product with this SKU already exists.' });
      return;
    }
    console.error('[products/update]', err.message);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// ── DELETE /api/products/:id ───────────────────────────────────────────────
// Frontend never deletes products in practice (uses toggleActive).
// Implemented for completeness; not used by UI in Phase 3D.
router.delete('/:id', requireRole('dealer_admin'), async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealerScope(req, res);
    if (!dealerId) return;

    const deleted = await db(TABLE)
      .where({ id: req.params.id, dealer_id: dealerId })
      .delete();

    if (!deleted) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.status(204).end();
  } catch (err: any) {
    console.error('[products/delete]', err.message);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;
