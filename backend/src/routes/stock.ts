/**
 * Stock REST routes — Phase 3D (read-only verification surface).
 *
 *   GET /api/stock?dealerId=&page=&pageSize=&f.product_id=&orderBy=&orderDir=
 *   GET /api/stock/:id?dealerId=
 *   GET /api/stock/by-product/:productId?dealerId=     (helper for shadow)
 *
 * Phase 3D EXPLICITLY does NOT expose write endpoints for stock. All stock
 * mutations (add/deduct/reserve/unreserve/etc.) are FIFO/RPC-driven and
 * MUST stay on Supabase until a future phase explicitly migrates them.
 *
 * Read endpoints are provided so the dataClient/vpsAdapter can shadow
 * generic stock list reads against Supabase for parity verification.
 */
import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';

const router = Router();
const TABLE = 'stock';

const SORTABLE = new Set([
  'product_id',
  'box_qty',
  'piece_qty',
  'sft_qty',
  'updated_at',
]);

const FILTERABLE = new Set(['product_id']);

function resolveDealerScope(req: Request, res: Response): string | null {
  const isSuperAdmin = req.user?.roles.includes('super_admin');
  const claimed = req.query.dealerId as string | undefined;

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

// ── GET /api/stock ─────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealerScope(req, res);
    if (!dealerId) return;

    const page = Math.max(0, parseInt((req.query.page as string) || '0', 10));
    const pageSize = Math.min(
      500,
      Math.max(1, parseInt((req.query.pageSize as string) || '50', 10)),
    );
    const orderBy = (req.query.orderBy as string) || 'updated_at';
    const orderDir = ((req.query.orderDir as string) || 'desc').toLowerCase();

    let q = db(TABLE).where({ dealer_id: dealerId });

    for (const [key, value] of Object.entries(req.query)) {
      if (!key.startsWith('f.')) continue;
      const col = key.slice(2);
      if (!FILTERABLE.has(col)) continue;
      q = q.andWhere(col, value as string);
    }

    const countQ = q
      .clone()
      .clearOrder()
      .clearSelect()
      .count<{ count: string }[]>('* as count');

    const sortCol = SORTABLE.has(orderBy) ? orderBy : 'updated_at';
    const sortDir = orderDir === 'asc' ? 'asc' : 'desc';

    const rowsQ = q
      .clone()
      .select('*')
      .orderBy(sortCol, sortDir)
      .offset(page * pageSize)
      .limit(pageSize);

    const [countRow] = await countQ;
    const rows = await rowsQ;

    res.json({
      rows,
      total: Number(countRow?.count ?? 0),
    });
  } catch (err: any) {
    console.error('[stock/list]', err.message);
    res.status(500).json({ error: 'Failed to list stock' });
  }
});

// ── GET /api/stock/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealerScope(req, res);
    if (!dealerId) return;

    const row = await db(TABLE)
      .where({ id: req.params.id, dealer_id: dealerId })
      .first();

    if (!row) {
      res.status(404).json({ error: 'Stock row not found' });
      return;
    }
    res.json({ row });
  } catch (err: any) {
    console.error('[stock/get]', err.message);
    res.status(500).json({ error: 'Failed to load stock' });
  }
});

export default router;
