/**
 * Purchases read routes — VPS migration phase 3H (reads only).
 *
 * Mirrors `purchaseService.list` and `purchaseService.getById` from the
 * React app so the PurchaseList and detail/document views can switch off
 * Supabase. Mutations (create/update/delete) remain on Supabase for now —
 * those carry FIFO batch creation, supplier ledger sync, audit logs and
 * backorder allocation, scheduled for a later phase.
 *
 *   GET /api/purchases?dealerId=&page=1&search=
 *   GET /api/purchases/:id
 */
import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';

const router = Router();
router.use(authenticate, tenantGuard);

const PAGE_SIZE = 25;

function resolveDealer(req: Request, res: Response): string | null {
  const isSuper = req.user?.roles.includes('super_admin');
  const claimed = (req.query.dealerId as string | undefined) || undefined;
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

router.get('/', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;

  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
  const search = ((req.query.search as string) || '').trim();
  const offset = (page - 1) * PAGE_SIZE;

  try {
    const base = db('purchases').where({ dealer_id: dealerId });
    if (search) base.andWhere('invoice_number', 'ilike', `%${search}%`);

    const [{ count: totalCount }] = await base
      .clone()
      .clearSelect()
      .clearOrder()
      .count<{ count: string }[]>('id as count');

    const rows = await base
      .clone()
      .select('*')
      .orderBy([
        { column: 'purchase_date', order: 'desc' },
        { column: 'created_at', order: 'desc' },
      ])
      .limit(PAGE_SIZE)
      .offset(offset);

    const supIds = Array.from(new Set(rows.map((r) => r.supplier_id).filter(Boolean)));
    const suppliers = supIds.length
      ? await db('suppliers').whereIn('id', supIds).select('id', 'name')
      : [];
    const supMap = new Map(suppliers.map((s: any) => [s.id, s]));

    const data = rows.map((r) => ({
      ...r,
      suppliers: r.supplier_id ? supMap.get(r.supplier_id) ?? null : null,
    }));

    res.json({ data, total: Number(totalCount) || 0 });
  } catch (err) {
    console.error('[purchases.list] error', err);
    res.status(500).json({ error: 'Failed to load purchases' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const { id } = req.params;

  try {
    const purchase = await db('purchases')
      .where({ id, dealer_id: dealerId })
      .first();
    if (!purchase) {
      res.status(404).json({ error: 'Purchase not found' });
      return;
    }

    const [supplier, items] = await Promise.all([
      purchase.supplier_id
        ? db('suppliers').where({ id: purchase.supplier_id }).first('id', 'name')
        : Promise.resolve(null),
      db('purchase_items as pi')
        .leftJoin('products as p', 'p.id', 'pi.product_id')
        .where('pi.purchase_id', id)
        .select(
          'pi.*',
          db.raw(`json_build_object(
            'name', p.name,
            'sku', p.sku,
            'unit_type', p.unit_type,
            'per_box_sft', p.per_box_sft
          ) as products`),
        ),
    ]);

    res.json({ ...purchase, suppliers: supplier ?? null, purchase_items: items });
  } catch (err) {
    console.error('[purchases.getById] error', err);
    res.status(500).json({ error: 'Failed to load purchase' });
  }
});

export default router;
