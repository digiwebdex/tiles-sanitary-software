/**
 * Product batches REST routes — Phase 3D (read-only verification surface).
 *
 *   GET /api/batches?dealerId=&page=&pageSize=&f.product_id=&f.status=&orderBy=&orderDir=
 *   GET /api/batches/:id?dealerId=
 *
 * Phase 3D EXPLICITLY does NOT expose write endpoints for batches. All
 * batch mutations (find-or-create, FIFO allocation, top-up, restore) are
 * RPC-driven and MUST stay on Supabase until a future phase migrates them.
 * That preserves shade/caliber/lot null-safe matching and atomic
 * allocation guarantees.
 *
 * Read endpoints support shadow comparisons (full list + per-id) and the
 * common per-product filter used by FIFO planning previews.
 */
import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';

const router = Router();
const TABLE = 'product_batches';

const SORTABLE = new Set([
  'created_at',
  'batch_no',
  'box_qty',
  'piece_qty',
  'status',
]);

const FILTERABLE = new Set([
  'product_id',
  'status',
  'shade_code',
  'caliber',
  'lot_no',
]);

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

// ── GET /api/batches ───────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealerScope(req, res);
    if (!dealerId) return;

    const page = Math.max(0, parseInt((req.query.page as string) || '0', 10));
    const pageSize = Math.min(
      500,
      Math.max(1, parseInt((req.query.pageSize as string) || '50', 10)),
    );
    // Default to oldest-first to match FIFO plan callers' expectations.
    const orderBy = (req.query.orderBy as string) || 'created_at';
    const orderDir = ((req.query.orderDir as string) || 'asc').toLowerCase();

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

    const sortCol = SORTABLE.has(orderBy) ? orderBy : 'created_at';
    const sortDir = orderDir === 'desc' ? 'desc' : 'asc';

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
    console.error('[batches/list]', err.message);
    res.status(500).json({ error: 'Failed to list batches' });
  }
});

// ── GET /api/batches/:id ───────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealerScope(req, res);
    if (!dealerId) return;

    const row = await db(TABLE)
      .where({ id: req.params.id, dealer_id: dealerId })
      .first();

    if (!row) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }
    res.json({ row });
  } catch (err: any) {
    console.error('[batches/get]', err.message);
    res.status(500).json({ error: 'Failed to load batch' });
  }
});

export default router;
