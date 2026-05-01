/**
 * Quotations route — Phase 3U-16.
 *
 *   GET    /api/quotations?dealerId=&search=&status=&page=&projectId=&siteId=
 *   GET    /api/quotations/:id
 *   GET    /api/quotations/:id/items
 *   GET    /api/quotations/:id/revisions
 *   POST   /api/quotations/sweep-expired
 *   POST   /api/quotations                            (create draft + items)
 *   PUT    /api/quotations/:id                        (update draft + replace items)
 *   POST   /api/quotations/:id/finalize               (draft → active, assigns Q-NNNNN)
 *   POST   /api/quotations/:id/cancel
 *   DELETE /api/quotations/:id                        (only when status='draft')
 *   POST   /api/quotations/:id/revise                 (revision RPC)
 *   POST   /api/quotations/:id/link-to-sale           body: { saleId }
 *   POST   /api/quotations/:id/conversion-prefill     returns prefill payload
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

const itemSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  product_name_snapshot: z.string().min(1),
  product_sku_snapshot: z.string().nullable().optional(),
  unit_type: z.enum(['box_sft', 'piece']),
  per_box_sft: z.number().nullable().optional(),
  quantity: z.coerce.number().min(0),
  rate: z.coerce.number().min(0),
  discount_value: z.coerce.number().min(0).default(0),
  preferred_shade_code: z.string().nullable().optional(),
  preferred_caliber: z.string().nullable().optional(),
  preferred_batch_no: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  measurement_snapshot: z.any().nullable().optional(),
  rate_source: z.enum(['default', 'tier', 'manual']).default('default'),
  tier_id: z.string().uuid().nullable().optional(),
  original_resolved_rate: z.number().nullable().optional(),
});

const formSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  customer_name_text: z.string().nullable().optional(),
  customer_phone_text: z.string().nullable().optional(),
  customer_address_text: z.string().nullable().optional(),
  quote_date: z.string(),
  valid_until: z.string(),
  discount_type: z.enum(['flat', 'percent']),
  discount_value: z.coerce.number().min(0),
  notes: z.string().nullable().optional(),
  terms_text: z.string().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  site_id: z.string().uuid().nullable().optional(),
  items: z.array(itemSchema),
});

function calcLineTotal(it: z.infer<typeof itemSchema>): number {
  const gross = Number(it.quantity || 0) * Number(it.rate || 0);
  const disc = Number(it.discount_value || 0);
  return Math.max(0, gross - disc);
}

function calcTotals(items: z.infer<typeof itemSchema>[], discountType: 'flat' | 'percent', discountValue: number) {
  const subtotal = items.reduce((s, it) => s + calcLineTotal(it), 0);
  const discountAmount =
    discountType === 'percent' ? (subtotal * Number(discountValue || 0)) / 100 : Number(discountValue || 0);
  const total = Math.max(0, subtotal - discountAmount);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    total_amount: Math.round(total * 100) / 100,
  };
}

/* ----- LISTS / DETAIL ----- */

router.get('/', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const search = String(req.query.search ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const projectId = (req.query.projectId as string) || null;
    const siteId = (req.query.siteId as string) || null;
    const offset = (page - 1) * PAGE_SIZE;

    // Auto-expire (silent, best-effort)
    try {
      await db.raw('SELECT expire_stale_quotations(?::uuid)', [dealerId]);
    } catch {/* non-fatal */}

    let q = db('quotations as q')
      .leftJoin('customers as c', 'c.id', 'q.customer_id')
      .leftJoin('projects as p', 'p.id', 'q.project_id')
      .leftJoin('project_sites as ps', 'ps.id', 'q.site_id')
      .where('q.dealer_id', dealerId);
    if (status) q = q.where('q.status', status);
    if (projectId) q = q.where('q.project_id', projectId);
    if (siteId) q = q.where('q.site_id', siteId);
    if (search) {
      q = q.where(function () {
        this.where('q.quotation_no', 'ilike', `%${search}%`)
          .orWhere('q.customer_name_text', 'ilike', `%${search}%`);
      });
    }

    const totalRow = await q.clone().clearSelect().clearOrder().count<{ count: string }[]>('q.id as count');
    const total = Number(totalRow[0]?.count ?? 0);

    const rows = await q
      .orderBy('q.created_at', 'desc')
      .limit(PAGE_SIZE)
      .offset(offset)
      .select(
        'q.*',
        'c.name as c_name',
        'c.phone as c_phone',
        'p.id as p_id',
        'p.project_name as p_name',
        'p.project_code as p_code',
        'ps.id as ps_id',
        'ps.site_name as ps_name',
        'ps.address as ps_address',
      );

    const data = rows.map((r: any) => {
      const { c_name, c_phone, p_id, p_name, p_code, ps_id, ps_name, ps_address, ...rest } = r;
      return {
        ...rest,
        customers: c_name ? { name: c_name, phone: c_phone } : null,
        projects: p_id ? { id: p_id, project_name: p_name, project_code: p_code } : null,
        project_sites: ps_id ? { id: ps_id, site_name: ps_name, address: ps_address } : null,
      };
    });
    res.json({ data, total });
  } catch (e: any) {
    console.error('[quotations GET]', e.message);
    res.status(500).json({ error: e.message || 'Failed to load quotations' });
  }
});

router.post('/sweep-expired', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const r = await db.raw('SELECT expire_stale_quotations(?::uuid) AS n', [dealerId]);
    res.json({ count: Number(r.rows?.[0]?.n ?? 0) });
  } catch (e: any) {
    console.error('[quotations sweep]', e.message);
    res.status(500).json({ error: e.message || 'Failed to sweep' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const row = await db('quotations as q')
      .leftJoin('customers as c', 'c.id', 'q.customer_id')
      .where('q.id', req.params.id)
      .where('q.dealer_id', dealerId)
      .first(
        'q.*',
        'c.id as c_id',
        'c.name as c_name',
        'c.phone as c_phone',
        'c.address as c_address',
      );
    if (!row) return res.status(404).json({ error: 'Quotation not found' });
    const { c_id, c_name, c_phone, c_address, ...rest } = row;
    res.json({
      data: {
        ...rest,
        customers: c_id
          ? { id: c_id, name: c_name, phone: c_phone, address: c_address }
          : null,
      },
    });
  } catch (e: any) {
    console.error('[quotations GET id]', e.message);
    res.status(500).json({ error: e.message || 'Failed to load quotation' });
  }
});

router.get('/:id/items', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const rows = await db('quotation_items')
      .where({ quotation_id: req.params.id, dealer_id: dealerId })
      .orderBy('sort_order', 'asc')
      .select('*');
    res.json({ data: rows });
  } catch (e: any) {
    console.error('[quotations items]', e.message);
    res.status(500).json({ error: e.message || 'Failed to load items' });
  }
});

router.get('/:id/revisions', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    // Find root by walking parent chain
    let cur = await db('quotations')
      .where({ id: req.params.id, dealer_id: dealerId })
      .first('id', 'parent_quotation_id');
    if (!cur) return res.status(404).json({ error: 'Quotation not found' });
    while (cur && cur.parent_quotation_id) {
      const parent = await db('quotations')
        .where({ id: cur.parent_quotation_id, dealer_id: dealerId })
        .first('id', 'parent_quotation_id');
      if (!parent) break;
      cur = parent;
    }
    const rootId = cur.id;
    const data = await db('quotations')
      .where('dealer_id', dealerId)
      .andWhere(function () {
        this.where('id', rootId).orWhere('parent_quotation_id', rootId);
      })
      .orderBy('revision_no', 'asc')
      .select('*');
    res.json({ data });
  } catch (e: any) {
    console.error('[quotations revisions]', e.message);
    res.status(500).json({ error: e.message || 'Failed to load revisions' });
  }
});

/* ----- MUTATIONS ----- */

async function insertItems(
  trx: any,
  dealerId: string,
  quotationId: string,
  items: z.infer<typeof itemSchema>[],
) {
  if (!items.length) return;
  const rows = items.map((it, idx) => ({
    dealer_id: dealerId,
    quotation_id: quotationId,
    product_id: it.product_id || null,
    product_name_snapshot: it.product_name_snapshot,
    product_sku_snapshot: it.product_sku_snapshot || null,
    unit_type: it.unit_type,
    per_box_sft: it.per_box_sft ?? null,
    quantity: it.quantity,
    rate: it.rate,
    discount_value: it.discount_value || 0,
    line_total: calcLineTotal(it),
    preferred_shade_code: it.preferred_shade_code || null,
    preferred_caliber: it.preferred_caliber || null,
    preferred_batch_no: it.preferred_batch_no || null,
    notes: it.notes || null,
    sort_order: idx,
    measurement_snapshot: it.measurement_snapshot ?? null,
    rate_source: it.rate_source ?? 'default',
    tier_id: it.tier_id ?? null,
    original_resolved_rate: it.original_resolved_rate ?? null,
  }));
  await trx('quotation_items').insert(rows);
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const parsed = formSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }
    const f = parsed.data;
    const totals = calcTotals(f.items, f.discount_type, f.discount_value);
    const userId = req.user?.userId ?? null;
    const draftNo = `DRAFT-${Date.now()}`;

    const created = await db.transaction(async (trx) => {
      const [q] = await trx('quotations')
        .insert({
          dealer_id: dealerId,
          quotation_no: draftNo,
          revision_no: 0,
          parent_quotation_id: null,
          customer_id: f.customer_id || null,
          customer_name_text: f.customer_name_text?.trim() || null,
          customer_phone_text: f.customer_phone_text?.trim() || null,
          customer_address_text: f.customer_address_text?.trim() || null,
          status: 'draft',
          quote_date: f.quote_date,
          valid_until: f.valid_until,
          subtotal: totals.subtotal,
          discount_type: f.discount_type,
          discount_value: f.discount_value,
          total_amount: totals.total_amount,
          notes: f.notes?.trim() || null,
          terms_text: f.terms_text?.trim() || null,
          project_id: f.project_id || null,
          site_id: f.site_id || null,
          created_by: userId,
        })
        .returning('*');
      await insertItems(trx, dealerId, q.id, f.items);
      return q;
    });

    res.status(201).json({ data: created });
  } catch (e: any) {
    console.error('[quotations POST]', e.message);
    res.status(500).json({ error: e.message || 'Failed to create quotation' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const parsed = formSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }
    const f = parsed.data;
    const totals = calcTotals(f.items, f.discount_type, f.discount_value);

    await db.transaction(async (trx) => {
      const existing = await trx('quotations')
        .where({ id: req.params.id, dealer_id: dealerId })
        .first('id', 'status');
      if (!existing) throw new Error('Quotation not found');
      await trx('quotations')
        .where({ id: req.params.id, dealer_id: dealerId })
        .update({
          customer_id: f.customer_id || null,
          customer_name_text: f.customer_name_text?.trim() || null,
          customer_phone_text: f.customer_phone_text?.trim() || null,
          customer_address_text: f.customer_address_text?.trim() || null,
          quote_date: f.quote_date,
          valid_until: f.valid_until,
          subtotal: totals.subtotal,
          discount_type: f.discount_type,
          discount_value: f.discount_value,
          total_amount: totals.total_amount,
          notes: f.notes?.trim() || null,
          terms_text: f.terms_text?.trim() || null,
          project_id: f.project_id || null,
          site_id: f.site_id || null,
          updated_at: new Date().toISOString(),
        });
      await trx('quotation_items')
        .where({ quotation_id: req.params.id, dealer_id: dealerId })
        .del();
      await insertItems(trx, dealerId, req.params.id, f.items);
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[quotations PUT]', e.message);
    res.status(e.message === 'Quotation not found' ? 404 : 500).json({ error: e.message || 'Failed to update quotation' });
  }
});

router.post('/:id/finalize', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const r = await db.raw('SELECT generate_next_quotation_no(?::uuid) AS no', [dealerId]);
    const newNo = String(r.rows?.[0]?.no ?? '');
    if (!newNo) return res.status(500).json({ error: 'Failed to generate quotation no' });
    const [row] = await db('quotations')
      .where({ id: req.params.id, dealer_id: dealerId, status: 'draft' })
      .update({ status: 'active', quotation_no: newNo, updated_at: new Date().toISOString() })
      .returning('*');
    if (!row) return res.status(409).json({ error: 'Only draft quotations can be finalized.' });
    res.json({ data: row });
  } catch (e: any) {
    console.error('[quotations finalize]', e.message);
    res.status(500).json({ error: e.message || 'Failed to finalize' });
  }
});

router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const [row] = await db('quotations')
      .where({ id: req.params.id, dealer_id: dealerId })
      .whereIn('status', ['draft', 'active', 'expired'])
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .returning('id');
    if (!row) return res.status(409).json({ error: 'Quotation cannot be cancelled in its current state.' });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[quotations cancel]', e.message);
    res.status(500).json({ error: e.message || 'Failed to cancel' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const n = await db('quotations')
      .where({ id: req.params.id, dealer_id: dealerId, status: 'draft' })
      .del();
    if (!n) return res.status(409).json({ error: 'Only draft quotations can be deleted.' });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[quotations DELETE]', e.message);
    res.status(500).json({ error: e.message || 'Failed to delete' });
  }
});

router.post('/:id/revise', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const r = await db.raw(
      'SELECT revise_quotation(?::uuid, ?::uuid) AS new_id',
      [req.params.id, dealerId],
    );
    const newId = r.rows?.[0]?.new_id;
    if (!newId) return res.status(409).json({ error: 'Quotation cannot be revised.' });
    res.json({ data: { id: String(newId) } });
  } catch (e: any) {
    console.error('[quotations revise]', e.message);
    res.status(500).json({ error: e.message || 'Failed to revise' });
  }
});

router.post('/:id/link-to-sale', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const saleId = String(req.body?.saleId ?? req.body?.sale_id ?? '');
    if (!saleId) return res.status(400).json({ error: 'saleId required' });
    await db.raw(
      'SELECT link_quotation_to_sale(?::uuid, ?::uuid, ?::uuid)',
      [req.params.id, saleId, dealerId],
    );
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[quotations link]', e.message);
    res.status(500).json({ error: e.message || 'Failed to link' });
  }
});

router.post('/:id/conversion-prefill', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const quote = await db('quotations as q')
      .leftJoin('customers as c', 'c.id', 'q.customer_id')
      .where({ 'q.id': req.params.id, 'q.dealer_id': dealerId })
      .first(
        'q.*',
        'c.id as c_id',
        'c.name as c_name',
        'c.phone as c_phone',
        'c.address as c_address',
      );
    if (!quote) return res.status(404).json({ error: 'Quotation not found' });
    const items = await db('quotation_items')
      .where({ quotation_id: req.params.id, dealer_id: dealerId })
      .orderBy('sort_order', 'asc')
      .select('*');

    const blockers: string[] = [];
    if (quote.dealer_id !== dealerId) blockers.push('Quotation belongs to a different dealer.');
    if (quote.status !== 'active') blockers.push(`Quotation is ${quote.status} — only active quotes can be converted.`);

    const customLines = items.filter((it: any) => !it.product_id);
    if (customLines.length > 0) {
      blockers.push(`${customLines.length} custom line(s) without a product link. Revise the quote and pick real products.`);
    }
    const productIds = items.map((it: any) => it.product_id).filter(Boolean) as string[];
    if (productIds.length > 0) {
      const prods = await db('products')
        .whereIn('id', productIds)
        .where('dealer_id', dealerId)
        .select('id', 'name', 'active');
      const liveMap = new Map(prods.map((p: any) => [p.id, p]));
      for (const it of items as any[]) {
        if (!it.product_id) continue;
        const p = liveMap.get(it.product_id) as any;
        if (!p) blockers.push(`Product "${it.product_name_snapshot}" no longer exists. Revise to replace it.`);
        else if (!p.active) blockers.push(`Product "${p.name}" is inactive. Revise to replace it.`);
      }
    }

    const customerName =
      (quote.c_name?.trim?.()) ||
      (quote.customer_name_text?.trim?.()) ||
      '';
    if (!customerName) blockers.push('Quotation has no customer name. Revise and add one.');

    const saleItems = (items as any[])
      .filter((it) => !!it.product_id)
      .map((it) => ({
        product_id: it.product_id,
        quantity: Number(it.quantity ?? 0),
        sale_rate: Number(it.rate ?? 0),
      }));

    const discountAmount =
      quote.discount_type === 'percent'
        ? Math.round((Number(quote.subtotal) * Number(quote.discount_value)) / 100 * 100) / 100
        : Number(quote.discount_value);

    const displayNo =
      Number(quote.revision_no) > 0 ? `${quote.quotation_no}-R${quote.revision_no}` : quote.quotation_no;

    const { c_id, c_name, c_phone, c_address, ...quoteRest } = quote;
    res.json({
      data: {
        quotation: {
          ...quoteRest,
          customers: c_id ? { id: c_id, name: c_name, phone: c_phone, address: c_address } : null,
        },
        customer_name: customerName,
        items: saleItems,
        discount: discountAmount,
        notes: [quote.notes, `From quotation ${displayNo}`].filter(Boolean).join(' · '),
        project_id: quote.project_id ?? null,
        site_id: quote.site_id ?? null,
        blockers,
      },
    });
  } catch (e: any) {
    console.error('[quotations prefill]', e.message);
    res.status(500).json({ error: e.message || 'Failed to prepare conversion' });
  }
});

export default router;
