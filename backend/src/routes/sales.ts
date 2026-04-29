/**
 * Sales read routes — VPS migration phase 3G (reads only).
 *
 * Mirrors the surface of `salesService.list` and `salesService.getById` from
 * the React app, so the SalesList and detail/document views can switch off
 * Supabase. Mutations (create/update/delete) remain on Supabase for now —
 * those carry FIFO batch allocation, ledger sync, audit, notifications and
 * are scheduled for a later phase to avoid regressing live dealers.
 *
 *   GET /api/sales?dealerId=&page=1&search=&projectId=&siteId=
 *   GET /api/sales/:id
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';

const router = Router();
router.use(authenticate, tenantGuard);

const PAGE_SIZE = 25;

function resolveDealer(req: Request, res: Response): string | null {
  const isSuper = req.user?.roles.includes('super_admin');
  const claimed =
    (req.query.dealerId as string | undefined) ||
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

router.get('/', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;

  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
  const search = ((req.query.search as string) || '').trim();
  const projectId = (req.query.projectId as string) || null;
  const siteId = (req.query.siteId as string) || null;

  const offset = (page - 1) * PAGE_SIZE;

  try {
    const base = db('sales').where({ dealer_id: dealerId });
    if (search) base.andWhere('invoice_number', 'ilike', `%${search}%`);
    if (projectId) base.andWhere('project_id', projectId);
    if (siteId) base.andWhere('site_id', siteId);

    const [{ count: totalCount }] = await base
      .clone()
      .clearSelect()
      .clearOrder()
      .count<{ count: string }[]>('id as count');

    const rows = await base
      .clone()
      .select('*')
      .orderBy([
        { column: 'sale_date', order: 'desc' },
        { column: 'created_at', order: 'desc' },
      ])
      .limit(PAGE_SIZE)
      .offset(offset);

    // Hydrate customers + projects + sites in batch (avoid n+1)
    const custIds = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean)));
    const projIds = Array.from(new Set(rows.map((r) => r.project_id).filter(Boolean)));
    const siteIds = Array.from(new Set(rows.map((r) => r.site_id).filter(Boolean)));

    const [customers, projects, sites] = await Promise.all([
      custIds.length
        ? db('customers').whereIn('id', custIds).select('id', 'name', 'type', 'phone', 'address')
        : Promise.resolve([]),
      projIds.length
        ? db('projects').whereIn('id', projIds).select('id', 'project_name', 'project_code')
        : Promise.resolve([]),
      siteIds.length
        ? db('project_sites').whereIn('id', siteIds).select('id', 'site_name', 'address')
        : Promise.resolve([]),
    ]);

    const custMap = new Map(customers.map((c: any) => [c.id, c]));
    const projMap = new Map(projects.map((p: any) => [p.id, p]));
    const siteMap = new Map(sites.map((s: any) => [s.id, s]));

    const data = rows.map((r) => ({
      ...r,
      customers: r.customer_id ? custMap.get(r.customer_id) ?? null : null,
      projects: r.project_id ? projMap.get(r.project_id) ?? null : null,
      project_sites: r.site_id ? siteMap.get(r.site_id) ?? null : null,
    }));

    res.json({ data, total: Number(totalCount) || 0 });
  } catch (err) {
    console.error('[sales.list] error', err);
    res.status(500).json({ error: 'Failed to load sales' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const { id } = req.params;

  try {
    const sale = await db('sales')
      .where({ id, dealer_id: dealerId })
      .first();
    if (!sale) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }

    const [customer, items] = await Promise.all([
      sale.customer_id
        ? db('customers')
            .where({ id: sale.customer_id })
            .first('id', 'name', 'type', 'phone', 'address')
        : Promise.resolve(null),
      db('sale_items as si')
        .leftJoin('products as p', 'p.id', 'si.product_id')
        .where('si.sale_id', id)
        .select(
          'si.*',
          db.raw(`json_build_object(
            'name', p.name,
            'sku', p.sku,
            'unit_type', p.unit_type,
            'per_box_sft', p.per_box_sft
          ) as products`),
        ),
    ]);

    res.json({ ...sale, customers: customer ?? null, sale_items: items });
  } catch (err) {
    console.error('[sales.getById] error', err);
    res.status(500).json({ error: 'Failed to load sale' });
  }
});

export default router;
