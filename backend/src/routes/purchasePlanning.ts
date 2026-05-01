/**
 * Purchase Planning route — Phase 3U-15.
 *
 * Read-only shortage aggregations + planning link writes.
 * Draft purchase creation stays on the frontend (it orchestrates the existing
 * VPS POST /api/purchases call, then writes links via /links).
 *
 * Endpoints:
 *   GET    /api/purchase-planning/product-shortages?dealerId=
 *   GET    /api/purchase-planning/customer-shortages?dealerId=&productId=
 *   GET    /api/purchase-planning/project-site-shortages?dealerId=
 *   GET    /api/purchase-planning/dashboard-stats?dealerId=
 *   GET    /api/purchase-planning/links/by-purchase/:purchaseId?dealerId=
 *   POST   /api/purchase-planning/links                  body: { dealerId, links: [...] }
 *   PATCH  /api/purchase-planning/purchase-items/:id/shortage-note  body: { dealerId, note }
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
    res.status(403).json({ error: 'Only dealer_admin can plan purchases' });
    return false;
  }
  return true;
}

type ShortageStatus = 'open' | 'planned' | 'partial' | 'fulfilled';

function deriveStatus(bo: number, alloc: number, planned: number): ShortageStatus {
  if (alloc >= bo && bo > 0) return 'fulfilled';
  if (alloc > 0) return 'partial';
  if (planned > 0) return 'planned';
  return 'open';
}

function splitContextKey(productId: string, shade: string | null, caliber: string | null): string {
  const s = (shade ?? '').trim();
  const c = (caliber ?? '').trim();
  if (!s && !c) return productId;
  return `${productId}|${s}|${c}`;
}

interface RawRow {
  id: string;
  product_id: string;
  sale_id: string;
  backorder_qty: number | string;
  allocated_qty: number | string;
  p_name: string | null;
  p_sku: string | null;
  p_brand: string | null;
  p_unit_type: string | null;
  s_invoice_number: string | null;
  s_sale_date: string | null;
  s_customer_id: string | null;
  s_project_id: string | null;
  s_site_id: string | null;
  s_created_at: string | null;
  s_quotation_id: string | null;
  c_name: string | null;
  pr_name: string | null;
  ps_name: string | null;
}

async function fetchOpenShortageRows(dealerId: string): Promise<RawRow[]> {
  return db('sale_items as si')
    .leftJoin('products as p', 'p.id', 'si.product_id')
    .leftJoin('sales as s', 's.id', 'si.sale_id')
    .leftJoin('customers as c', 'c.id', 's.customer_id')
    .leftJoin('projects as pr', 'pr.id', 's.project_id')
    .leftJoin('project_sites as ps', 'ps.id', 's.site_id')
    .where('si.dealer_id', dealerId)
    .where('si.backorder_qty', '>', 0)
    .select(
      'si.id',
      'si.product_id',
      'si.sale_id',
      'si.backorder_qty',
      'si.allocated_qty',
      'p.name as p_name',
      'p.sku as p_sku',
      'p.brand as p_brand',
      'p.unit_type as p_unit_type',
      's.invoice_number as s_invoice_number',
      's.sale_date as s_sale_date',
      's.customer_id as s_customer_id',
      's.project_id as s_project_id',
      's.site_id as s_site_id',
      's.created_at as s_created_at',
      's.quotation_id as s_quotation_id',
      'c.name as c_name',
      'pr.project_name as pr_name',
      'ps.site_name as ps_name',
    );
}

async function fetchLinksForSaleItems(dealerId: string, saleItemIds: string[]) {
  const map = new Map<string, Array<{ purchase_id: string; planned_qty: number; link_type: string }>>();
  if (saleItemIds.length === 0) return map;
  const links = await db('purchase_shortage_links')
    .where({ dealer_id: dealerId })
    .whereIn('sale_item_id', saleItemIds)
    .select('sale_item_id', 'purchase_id', 'planned_qty', 'link_type');
  for (const l of links) {
    const arr = map.get(l.sale_item_id) ?? [];
    arr.push({
      purchase_id: l.purchase_id,
      planned_qty: Number(l.planned_qty) || 0,
      link_type: l.link_type,
    });
    map.set(l.sale_item_id, arr);
  }
  return map;
}

async function fetchPreferences(dealerId: string, rows: RawRow[]) {
  const out = new Map<string, { shade: string | null; caliber: string | null; batch: string | null }>();
  const quotationIds = Array.from(
    new Set(rows.map((r) => r.s_quotation_id).filter(Boolean) as string[]),
  );
  if (quotationIds.length === 0) return out;
  try {
    const items = await db('quotation_items')
      .where({ dealer_id: dealerId })
      .whereIn('quotation_id', quotationIds)
      .select('quotation_id', 'product_id', 'preferred_shade_code', 'preferred_caliber', 'preferred_batch_no');
    for (const qi of items) {
      out.set(`${qi.quotation_id}|${qi.product_id}`, {
        shade: qi.preferred_shade_code ?? null,
        caliber: qi.preferred_caliber ?? null,
        batch: qi.preferred_batch_no ?? null,
      });
    }
  } catch {
    // best-effort
  }
  return out;
}

function unfulfilled(r: RawRow) {
  const bo = Number(r.backorder_qty) || 0;
  const al = Number(r.allocated_qty) || 0;
  return Math.max(0, bo - al);
}

router.get('/product-shortages', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const rows = await fetchOpenShortageRows(dealerId);
    const prefs = await fetchPreferences(dealerId, rows);
    const links = await fetchLinksForSaleItems(dealerId, rows.map((r) => r.id));
    const map = new Map<string, any>();
    for (const r of rows) {
      const need = unfulfilled(r);
      if (need <= 0) continue;
      const date = r.s_sale_date ?? r.s_created_at ?? null;
      const cust = r.s_customer_id ?? 'anon';
      const pref = (r.s_quotation_id ? prefs.get(`${r.s_quotation_id}|${r.product_id}`) : null) ?? {
        shade: null, caliber: null, batch: null,
      };
      const key = splitContextKey(r.product_id, pref.shade, pref.caliber);
      const lks = links.get(r.id) ?? [];
      const planned = lks.reduce((s, l) => s + (l.planned_qty || 0), 0);
      const alloc = Number(r.allocated_qty) || 0;
      const bo = Number(r.backorder_qty) || 0;
      const cur = map.get(key);
      if (cur) {
        cur.shortage_qty += need;
        cur.pending_lines += 1;
        cur.customerSet.add(cust);
        cur.planned_qty += Math.min(planned, need);
        cur.fulfilled_qty += Math.min(alloc, bo);
        cur.open_qty = Math.max(0, cur.shortage_qty - cur.planned_qty);
        if (date && (!cur.oldest_demand_date || date < cur.oldest_demand_date)) {
          cur.oldest_demand_date = date;
        }
        cur.suggested_purchase_qty = cur.open_qty || cur.shortage_qty;
        if (pref.shade || pref.caliber) {
          const tag = [pref.shade, pref.caliber].filter(Boolean).join('/');
          if (!cur.name.includes(`(${tag})`)) cur.name = `${cur.name.split(' (')[0]} (${tag})`;
        }
      } else {
        const tag =
          pref.shade || pref.caliber
            ? ` (${[pref.shade, pref.caliber].filter(Boolean).join('/')})`
            : '';
        const baseName = (r.p_name ?? 'Unknown') + tag;
        map.set(key, {
          product_id: r.product_id,
          name: baseName,
          sku: r.p_sku ?? '',
          brand: r.p_brand ?? '—',
          unit_type: r.p_unit_type ?? 'piece',
          shortage_qty: need,
          pending_lines: 1,
          pending_customers: 0,
          oldest_demand_date: date,
          suggested_purchase_qty: Math.max(0, need - planned),
          open_qty: Math.max(0, need - planned),
          planned_qty: Math.min(planned, need),
          fulfilled_qty: Math.min(alloc, bo),
          customerSet: new Set([cust]),
        });
      }
    }
    const out = Array.from(map.values())
      .map(({ customerSet, ...rest }: any) => ({ ...rest, pending_customers: customerSet.size }))
      .sort((a: any, b: any) => b.shortage_qty - a.shortage_qty);
    res.json({ rows: out });
  } catch (e: any) {
    console.error('[purchase-planning/product-shortages]', e.message);
    res.status(500).json({ error: 'Failed to load product shortages' });
  }
});

router.get('/customer-shortages', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const productId = req.query.productId as string | undefined;
    const rows = await fetchOpenShortageRows(dealerId);
    const prefs = await fetchPreferences(dealerId, rows);
    const links = await fetchLinksForSaleItems(dealerId, rows.map((r) => r.id));
    const out: any[] = [];
    for (const r of rows) {
      const need = unfulfilled(r);
      if (need <= 0) continue;
      if (productId && r.product_id !== productId) continue;
      const lks = links.get(r.id) ?? [];
      const planned = lks.reduce((s, l) => s + (l.planned_qty || 0), 0);
      const alloc = Number(r.allocated_qty) || 0;
      const bo = Number(r.backorder_qty) || 0;
      const status = deriveStatus(bo, alloc, planned);
      const pref = (r.s_quotation_id ? prefs.get(`${r.s_quotation_id}|${r.product_id}`) : null) ?? {
        shade: null, caliber: null, batch: null,
      };
      out.push({
        sale_item_id: r.id,
        customer_id: r.s_customer_id ?? '',
        customer_name: r.c_name ?? '—',
        product_id: r.product_id,
        product_name: r.p_name ?? 'Unknown',
        product_sku: r.p_sku ?? '',
        unit_type: r.p_unit_type ?? 'piece',
        sale_id: r.sale_id,
        invoice_number: r.s_invoice_number ?? null,
        sale_date: r.s_sale_date ?? r.s_created_at ?? '',
        project_id: r.s_project_id ?? null,
        project_name: r.pr_name ?? null,
        site_id: r.s_site_id ?? null,
        site_name: r.ps_name ?? null,
        shortage_qty: need,
        status,
        planned_qty: planned,
        allocated_qty: alloc,
        backorder_qty: bo,
        preferred_shade_code: pref.shade,
        preferred_caliber: pref.caliber,
        preferred_batch_no: pref.batch,
        linked_purchase_ids: Array.from(new Set(lks.map((l) => l.purchase_id))),
      });
    }
    out.sort((a, b) => (a.sale_date < b.sale_date ? -1 : 1));
    res.json({ rows: out });
  } catch (e: any) {
    console.error('[purchase-planning/customer-shortages]', e.message);
    res.status(500).json({ error: 'Failed to load customer shortages' });
  }
});

router.get('/project-site-shortages', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    // Build from customer-level rollup
    const customerListUrl = new URL(req.protocol + '://' + req.get('host') + '/api/purchase-planning/customer-shortages');
    customerListUrl.searchParams.set('dealerId', dealerId);
    // Inline call instead of HTTP
    const rawCustomers: any[] = await (async () => {
      const rows = await fetchOpenShortageRows(dealerId);
      const prefs = await fetchPreferences(dealerId, rows);
      const links = await fetchLinksForSaleItems(dealerId, rows.map((r) => r.id));
      const list: any[] = [];
      for (const r of rows) {
        const need = unfulfilled(r);
        if (need <= 0) continue;
        const lks = links.get(r.id) ?? [];
        const planned = lks.reduce((s, l) => s + (l.planned_qty || 0), 0);
        list.push({
          customer_id: r.s_customer_id ?? '',
          customer_name: r.c_name ?? '—',
          product_id: r.product_id,
          project_id: r.s_project_id ?? null,
          project_name: r.pr_name ?? null,
          site_id: r.s_site_id ?? null,
          site_name: r.ps_name ?? null,
          sale_date: r.s_sale_date ?? r.s_created_at ?? '',
          shortage_qty: need,
          planned_qty: planned,
        });
      }
      return list;
    })();

    const map = new Map<string, any>();
    for (const r of rawCustomers) {
      const key = `${r.project_id ?? '_'}|${r.site_id ?? '_'}|${r.customer_id ?? '_'}`;
      const cur = map.get(key);
      if (cur) {
        cur.shortage_qty += r.shortage_qty;
        cur.pending_lines += 1;
        cur.products.add(r.product_id);
        cur.planned_qty += r.planned_qty;
        cur.open_qty = Math.max(0, cur.shortage_qty - cur.planned_qty);
        if (r.sale_date && (!cur.oldest_demand_date || r.sale_date < cur.oldest_demand_date)) {
          cur.oldest_demand_date = r.sale_date;
        }
      } else {
        map.set(key, {
          key,
          project_id: r.project_id,
          project_name: r.project_name ?? 'Direct Sale',
          site_id: r.site_id,
          site_name: r.site_name,
          customer_id: r.customer_id || null,
          customer_name: r.customer_name,
          shortage_qty: r.shortage_qty,
          pending_lines: 1,
          pending_products: 0,
          oldest_demand_date: r.sale_date || null,
          open_qty: Math.max(0, r.shortage_qty - r.planned_qty),
          planned_qty: r.planned_qty,
          products: new Set([r.product_id]),
        });
      }
    }
    const out = Array.from(map.values())
      .map(({ products, ...rest }: any) => ({ ...rest, pending_products: products.size }))
      .sort((a: any, b: any) => b.shortage_qty - a.shortage_qty);
    res.json({ rows: out });
  } catch (e: any) {
    console.error('[purchase-planning/project-site-shortages]', e.message);
    res.status(500).json({ error: 'Failed to load project shortages' });
  }
});

router.get('/dashboard-stats', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    // Build everything fresh in one pass
    const rows = await fetchOpenShortageRows(dealerId);
    const prefs = await fetchPreferences(dealerId, rows);
    const links = await fetchLinksForSaleItems(dealerId, rows.map((r) => r.id));

    // product map
    const prodMap = new Map<string, any>();
    const customerSet = new Set<string>();
    let openCount = 0, plannedCount = 0, partialCount = 0;
    let oldest: string | null = null;

    for (const r of rows) {
      const need = unfulfilled(r);
      if (need <= 0) continue;
      const lks = links.get(r.id) ?? [];
      const planned = lks.reduce((s, l) => s + (l.planned_qty || 0), 0);
      const alloc = Number(r.allocated_qty) || 0;
      const bo = Number(r.backorder_qty) || 0;
      const status = deriveStatus(bo, alloc, planned);
      if (status === 'open') openCount++;
      else if (status === 'planned') plannedCount++;
      else if (status === 'partial') partialCount++;

      const date = r.s_sale_date ?? r.s_created_at ?? null;
      if (date && (!oldest || date < oldest)) oldest = date;
      if (r.s_customer_id) customerSet.add(r.s_customer_id);

      const pref = (r.s_quotation_id ? prefs.get(`${r.s_quotation_id}|${r.product_id}`) : null) ?? {
        shade: null, caliber: null, batch: null,
      };
      const key = splitContextKey(r.product_id, pref.shade, pref.caliber);
      const cur = prodMap.get(key);
      const tag =
        pref.shade || pref.caliber
          ? ` (${[pref.shade, pref.caliber].filter(Boolean).join('/')})`
          : '';
      const baseName = (r.p_name ?? 'Unknown') + tag;
      if (cur) {
        cur.shortage_qty += need;
      } else {
        prodMap.set(key, {
          product_id: r.product_id,
          name: baseName,
          sku: r.p_sku ?? '',
          brand: r.p_brand ?? '—',
          unit_type: r.p_unit_type ?? 'piece',
          shortage_qty: need,
        });
      }
    }
    const products = Array.from(prodMap.values()).sort(
      (a: any, b: any) => b.shortage_qty - a.shortage_qty,
    );
    const totalShortageUnits = products.reduce((s: number, p: any) => s + p.shortage_qty, 0);

    res.json({
      totalProductsShort: products.length,
      totalShortageUnits,
      totalCustomersWaiting: customerSet.size,
      oldestDemandDate: oldest,
      topProducts: products.slice(0, 5),
      topProjects: [], // top-projects requires the project rollup; clients that need it call /project-site-shortages
      openCount,
      plannedCount,
      partialCount,
    });
  } catch (e: any) {
    console.error('[purchase-planning/dashboard-stats]', e.message);
    res.status(500).json({ error: 'Failed to load planning stats' });
  }
});

router.get('/links/by-purchase/:purchaseId', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const purchaseId = req.params.purchaseId;
    const links = await db('purchase_shortage_links')
      .where({ dealer_id: dealerId, purchase_id: purchaseId })
      .select('id', 'sale_item_id', 'planned_qty', 'link_type', 'notes');
    if (links.length === 0) {
      res.json({ rows: [] });
      return;
    }
    const saleItemIds = Array.from(new Set(links.map((l) => l.sale_item_id)));
    const items = await db('sale_items as si')
      .leftJoin('products as p', 'p.id', 'si.product_id')
      .leftJoin('sales as s', 's.id', 'si.sale_id')
      .leftJoin('customers as c', 'c.id', 's.customer_id')
      .leftJoin('projects as pr', 'pr.id', 's.project_id')
      .leftJoin('project_sites as ps', 'ps.id', 's.site_id')
      .where('si.dealer_id', dealerId)
      .whereIn('si.id', saleItemIds)
      .select(
        'si.id',
        'si.product_id',
        'si.backorder_qty',
        'si.allocated_qty',
        'p.name as p_name',
        'p.sku as p_sku',
        'p.unit_type as p_unit_type',
        's.invoice_number as s_invoice_number',
        's.sale_date as s_sale_date',
        'c.name as c_name',
        'pr.project_name as pr_name',
        'ps.site_name as ps_name',
      );
    const byId = new Map<string, any>();
    for (const it of items) byId.set(it.id, it);

    const out = links.map((l) => {
      const it = byId.get(l.sale_item_id);
      const bo = Number(it?.backorder_qty) || 0;
      const al = Number(it?.allocated_qty) || 0;
      return {
        link_id: l.id,
        sale_item_id: l.sale_item_id,
        planned_qty: Number(l.planned_qty) || 0,
        link_type: l.link_type,
        notes: l.notes,
        product_id: it?.product_id ?? '',
        product_name: it?.p_name ?? '—',
        product_sku: it?.p_sku ?? '',
        unit_type: it?.p_unit_type ?? 'piece',
        customer_name: it?.c_name ?? '—',
        invoice_number: it?.s_invoice_number ?? null,
        sale_date: it?.s_sale_date ?? null,
        project_name: it?.pr_name ?? null,
        site_name: it?.ps_name ?? null,
        backorder_qty: bo,
        allocated_qty: al,
        status: deriveStatus(bo, al, Number(l.planned_qty) || 0),
      };
    });
    res.json({ rows: out });
  } catch (e: any) {
    console.error('[purchase-planning/links-by-purchase]', e.message);
    res.status(500).json({ error: 'Failed to load shortage links' });
  }
});

const linksInsertSchema = z.object({
  links: z.array(z.object({
    sale_item_id: z.string().uuid(),
    purchase_id: z.string().uuid(),
    purchase_item_id: z.string().uuid().nullable().optional(),
    planned_qty: z.number().positive(),
    link_type: z.string().trim().min(1).max(40),
    notes: z.string().nullable().optional(),
    created_by: z.string().uuid().nullable().optional(),
  })).min(1),
});

router.post('/links', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    if (!requireAdmin(req, res)) return;
    const parsed = linksInsertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }
    const rows = parsed.data.links.map((l) => ({
      dealer_id: dealerId,
      sale_item_id: l.sale_item_id,
      purchase_id: l.purchase_id,
      purchase_item_id: l.purchase_item_id ?? null,
      planned_qty: l.planned_qty,
      link_type: l.link_type,
      notes: l.notes ?? null,
      created_by: l.created_by ?? req.user?.userId ?? null,
    }));
    const inserted = await db('purchase_shortage_links').insert(rows).returning('*');
    res.status(201).json({ rows: inserted });
  } catch (e: any) {
    console.error('[purchase-planning/links POST]', e.message);
    res.status(500).json({ error: e.message || 'Failed to write planning links' });
  }
});

const noteSchema = z.object({ note: z.string().trim().max(2000) });
router.patch('/purchase-items/:id/shortage-note', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    if (!requireAdmin(req, res)) return;
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }
    const result = await db('purchase_items')
      .where({ id: req.params.id, dealer_id: dealerId })
      .update({ shortage_note: parsed.data.note });
    if (!result) {
      res.status(404).json({ error: 'Purchase item not found' });
      return;
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[purchase-planning/shortage-note]', e.message);
    res.status(500).json({ error: e.message || 'Failed to update shortage note' });
  }
});

export default router;
