/**
 * Pricing Tier Reports — VPS migration phase 3J-2 (reads only).
 *
 * Mirrors src/services/pricingTierReportService.ts:
 *   GET /api/reports/pricing-tier/tiers?dealerId=
 *   GET /api/reports/pricing-tier/customers?dealerId=
 *   GET /api/reports/pricing-tier/sales?dealerId=&from=&to=
 *   GET /api/reports/pricing-tier/quoted?dealerId=&from=&to=
 *   GET /api/reports/pricing-tier/manual-overrides?dealerId=&from=&to=
 *   GET /api/reports/pricing-tier/dashboard?dealerId=
 *
 * Dealer-scoped, financial → dealer_admin/super_admin only.
 */
import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';
import { hasRole } from '../middleware/roles';

const router = Router();
router.use(authenticate, tenantGuard);

const round2 = (n: number) => Math.round(n * 100) / 100;

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

function requireFinancialRole(req: Request, res: Response): boolean {
  if (hasRole(req, 'dealer_admin') || hasRole(req, 'super_admin')) return true;
  res.status(403).json({ error: 'Reports require dealer_admin role' });
  return false;
}

// ── 1. Tier list ─────────────────────────────────────────────
router.get('/tiers', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  try {
    const [tiers, items, customers] = await Promise.all([
      db('price_tiers').where({ dealer_id: dealerId }).orderBy('name')
        .select('id', 'name', 'status', 'is_default'),
      db('price_tier_items').where({ dealer_id: dealerId }).select('tier_id'),
      db('customers').where({ dealer_id: dealerId }).whereNotNull('price_tier_id').select('price_tier_id'),
    ]);

    const productCount = new Map<string, number>();
    for (const it of items) productCount.set(it.tier_id, (productCount.get(it.tier_id) ?? 0) + 1);
    const customerCount = new Map<string, number>();
    for (const c of customers) {
      if (c.price_tier_id) customerCount.set(c.price_tier_id, (customerCount.get(c.price_tier_id) ?? 0) + 1);
    }

    res.json(tiers.map((t: any) => ({
      tier_id: t.id,
      tier_name: t.name,
      status: t.status,
      is_default: t.is_default,
      product_count: productCount.get(t.id) ?? 0,
      customer_count: customerCount.get(t.id) ?? 0,
    })));
  } catch (err) {
    console.error('[pricing-tier.tiers]', err);
    res.status(500).json({ error: 'Failed to load tier list' });
  }
});

// ── 2. Customers by tier ─────────────────────────────────────
router.get('/customers', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  try {
    const customers = await db('customers as c')
      .leftJoin('price_tiers as t', 't.id', 'c.price_tier_id')
      .where('c.dealer_id', dealerId)
      .orderBy('c.name')
      .select('c.id', 'c.name', 'c.type', 'c.price_tier_id', 't.name as tier_name');

    if (!customers.length) { res.json([]); return; }

    const ids = customers.map((c: any) => c.id);
    const [salesAgg, quotesAgg] = await Promise.all([
      db('sales').where({ dealer_id: dealerId }).whereIn('customer_id', ids)
        .select('customer_id').sum<{ customer_id: string; total: string }[]>('total_amount as total').groupBy('customer_id'),
      db('quotations').where({ dealer_id: dealerId }).whereIn('customer_id', ids).whereNot('status', 'cancelled')
        .select('customer_id').sum<{ customer_id: string; total: string }[]>('total_amount as total').groupBy('customer_id'),
    ]);
    const salesMap = new Map(salesAgg.map((r: any) => [r.customer_id, Number(r.total) || 0]));
    const quotesMap = new Map(quotesAgg.map((r: any) => [r.customer_id, Number(r.total) || 0]));

    res.json(customers.map((c: any) => ({
      customer_id: c.id,
      customer_name: c.name,
      customer_type: c.type,
      tier_id: c.price_tier_id,
      tier_name: c.tier_name,
      total_sales: round2(salesMap.get(c.id) ?? 0),
      total_quoted: round2(quotesMap.get(c.id) ?? 0),
    })));
  } catch (err) {
    console.error('[pricing-tier.customers]', err);
    res.status(500).json({ error: 'Failed to load customers by tier' });
  }
});

// ── 3. Sales by tier ─────────────────────────────────────────
router.get('/sales', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  const from = (req.query.from as string | undefined) || undefined;
  const to = (req.query.to as string | undefined) || undefined;

  try {
    let q = db('sale_items as si')
      .innerJoin('sales as s', 's.id', 'si.sale_id')
      .leftJoin('price_tiers as t', 't.id', 'si.tier_id')
      .where('si.dealer_id', dealerId);
    if (from) q = q.andWhere('s.sale_date', '>=', from);
    if (to) q = q.andWhere('s.sale_date', '<=', to);

    const rows = await q.select('si.tier_id', 't.name as tier_name', 'si.total', 'si.sale_id').limit(50000);

    const map = new Map<string, { name: string; sales: number; saleIds: Set<string> }>();
    for (const r of rows as any[]) {
      const key = r.tier_id ?? '__none';
      const name = r.tier_id ? (r.tier_name ?? 'Unknown') : 'No Tier (Default)';
      const cur = map.get(key) ?? { name, sales: 0, saleIds: new Set<string>() };
      cur.sales += Number(r.total ?? 0);
      cur.saleIds.add(r.sale_id);
      map.set(key, cur);
    }

    const result = Array.from(map.entries()).map(([k, v]) => ({
      tier_id: k === '__none' ? null : k,
      tier_name: v.name,
      invoice_count: v.saleIds.size,
      total_sales: round2(v.sales),
      avg_ticket: v.saleIds.size > 0 ? round2(v.sales / v.saleIds.size) : 0,
    })).sort((a, b) => b.total_sales - a.total_sales);
    res.json(result);
  } catch (err) {
    console.error('[pricing-tier.sales]', err);
    res.status(500).json({ error: 'Failed to load sales by tier' });
  }
});

// ── 4. Quoted value by tier ──────────────────────────────────
router.get('/quoted', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  const from = (req.query.from as string | undefined) || undefined;
  const to = (req.query.to as string | undefined) || undefined;

  try {
    let q = db('quotation_items as qi')
      .innerJoin('quotations as q', 'q.id', 'qi.quotation_id')
      .leftJoin('price_tiers as t', 't.id', 'qi.tier_id')
      .where('qi.dealer_id', dealerId);
    if (from) q = q.andWhere('q.quote_date', '>=', from);
    if (to) q = q.andWhere('q.quote_date', '<=', to);

    const rows = await q.select(
      'qi.tier_id', 't.name as tier_name', 'qi.line_total',
      'qi.quotation_id', 'q.status as q_status'
    ).limit(50000);

    const map = new Map<string, { name: string; quoted: number; converted: number; quoteIds: Set<string> }>();
    for (const r of rows as any[]) {
      const key = r.tier_id ?? '__none';
      const name = r.tier_id ? (r.tier_name ?? 'Unknown') : 'No Tier (Default)';
      const cur = map.get(key) ?? { name, quoted: 0, converted: 0, quoteIds: new Set<string>() };
      const amt = Number(r.line_total ?? 0);
      cur.quoted += amt;
      if (r.q_status === 'converted') cur.converted += amt;
      cur.quoteIds.add(r.quotation_id);
      map.set(key, cur);
    }

    const result = Array.from(map.entries()).map(([k, v]) => ({
      tier_id: k === '__none' ? null : k,
      tier_name: v.name,
      quote_count: v.quoteIds.size,
      total_quoted: round2(v.quoted),
      converted_value: round2(v.converted),
    })).sort((a, b) => b.total_quoted - a.total_quoted);
    res.json(result);
  } catch (err) {
    console.error('[pricing-tier.quoted]', err);
    res.status(500).json({ error: 'Failed to load quoted by tier' });
  }
});

// ── 5. Manual overrides ──────────────────────────────────────
router.get('/manual-overrides', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  const from = (req.query.from as string | undefined) || undefined;
  const to = (req.query.to as string | undefined) || undefined;

  try {
    let q = db('sale_items as si')
      .innerJoin('sales as s', 's.id', 'si.sale_id')
      .leftJoin('products as p', 'p.id', 'si.product_id')
      .leftJoin('customers as c', 'c.id', 's.customer_id')
      .leftJoin('profiles as pr', 'pr.id', 's.created_by')
      .where('si.dealer_id', dealerId)
      .andWhere('si.rate_source', 'manual');
    if (from) q = q.andWhere('s.sale_date', '>=', from);
    if (to) q = q.andWhere('s.sale_date', '<=', to);

    const rows = await q.select(
      'si.product_id', 'si.sale_rate', 'si.original_resolved_rate', 'si.quantity',
      'p.name as product_name', 's.customer_id', 's.created_by',
      'c.name as customer_name', 'pr.name as user_name'
    ).limit(20000);

    const map = new Map<string, any>();
    for (const r of rows as any[]) {
      const userId = r.created_by ?? null;
      const userName = r.user_name ?? 'Unknown user';
      const customerId = r.customer_id ?? null;
      const customerName = r.customer_name ?? 'Walk-in';
      const productName = r.product_name ?? 'Unknown';
      const key = `${userId ?? '_'}|${customerId ?? '_'}|${r.product_id}`;
      const orig = Number(r.original_resolved_rate ?? r.sale_rate ?? 0);
      const final = Number(r.sale_rate ?? 0);
      const impact = (final - orig) * Number(r.quantity ?? 0);
      const cur = map.get(key) ?? {
        user_id: userId, user_name: userName,
        customer_id: customerId, customer_name: customerName,
        product_id: r.product_id, product_name: productName,
        override_count: 0, total_impact: 0,
      };
      cur.override_count += 1;
      cur.total_impact += impact;
      map.set(key, cur);
    }

    const result = Array.from(map.values())
      .map((r) => ({ ...r, total_impact: round2(r.total_impact) }))
      .sort((a, b) => b.override_count - a.override_count);
    res.json(result);
  } catch (err) {
    console.error('[pricing-tier.manual-overrides]', err);
    res.status(500).json({ error: 'Failed to load manual overrides' });
  }
});

// ── 6. Dashboard stats ───────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const d7 = new Date(today.getTime() - 7 * 86400000).toISOString().split('T')[0];
    const d30 = new Date(today.getTime() - 30 * 86400000).toISOString().split('T')[0];

    // Reuse sales-by-tier logic inline for last 30d
    const salesRows = await db('sale_items as si')
      .innerJoin('sales as s', 's.id', 'si.sale_id')
      .leftJoin('price_tiers as t', 't.id', 'si.tier_id')
      .where('si.dealer_id', dealerId)
      .andWhere('s.sale_date', '>=', d30)
      .andWhere('s.sale_date', '<=', todayStr)
      .select('si.tier_id', 't.name as tier_name', 'si.total', 'si.sale_id')
      .limit(50000);

    const tierMap = new Map<string, { name: string; sales: number; saleIds: Set<string> }>();
    for (const r of salesRows as any[]) {
      const key = r.tier_id ?? '__none';
      const name = r.tier_id ? (r.tier_name ?? 'Unknown') : 'No Tier (Default)';
      const cur = tierMap.get(key) ?? { name, sales: 0, saleIds: new Set<string>() };
      cur.sales += Number(r.total ?? 0);
      cur.saleIds.add(r.sale_id);
      tierMap.set(key, cur);
    }
    const salesByTier = Array.from(tierMap.entries()).map(([k, v]) => ({
      tier_id: k === '__none' ? null : k,
      tier_name: v.name,
      invoice_count: v.saleIds.size,
      total_sales: round2(v.sales),
      avg_ticket: v.saleIds.size > 0 ? round2(v.sales / v.saleIds.size) : 0,
    })).sort((a, b) => b.total_sales - a.total_sales);

    // Overrides 30d
    const overrides = await db('sale_items as si')
      .innerJoin('sales as s', 's.id', 'si.sale_id')
      .where('si.dealer_id', dealerId)
      .andWhere('si.rate_source', 'manual')
      .andWhere('s.sale_date', '>=', d30)
      .select('si.sale_rate', 'si.original_resolved_rate', 'si.quantity', 's.sale_date');

    let count7 = 0, count30 = 0, impact30 = 0;
    for (const r of overrides as any[]) {
      count30 += 1;
      if ((r.sale_date ?? '') >= d7) count7 += 1;
      const orig = Number(r.original_resolved_rate ?? r.sale_rate ?? 0);
      const final = Number(r.sale_rate ?? 0);
      impact30 += (final - orig) * Number(r.quantity ?? 0);
    }

    const customers = await db('customers')
      .where({ dealer_id: dealerId, status: 'active' })
      .select('id', 'price_tier_id');
    const customersWithoutTier = customers.filter((c: any) => !c.price_tier_id).length;

    res.json({
      salesByTier,
      overrideCount7d: count7,
      overrideCount30d: count30,
      overrideImpact30d: round2(impact30),
      customersWithoutTier,
    });
  } catch (err) {
    console.error('[pricing-tier.dashboard]', err);
    res.status(500).json({ error: 'Failed to load tier dashboard' });
  }
});

export default router;
