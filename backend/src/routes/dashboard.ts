/**
 * Dashboard aggregation route — Phase 2 data path migration.
 *
 *   GET /api/dashboard?dealerId=<uuid>
 *
 * Returns the same shape as `src/services/dashboardService.ts → DashboardData`
 * so the frontend can swap from Supabase → VPS without UI changes.
 *
 * All queries are dealer-scoped. Salesman role is allowed to call this
 * endpoint, but the frontend hides the financial widgets for them anyway.
 */
import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';

const router = Router();
router.use(authenticate, tenantGuard);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function round2(n: unknown): number {
  const v = Number(n) || 0;
  return Math.round(v * 100) / 100;
}

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

  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yearStart = `${now.getFullYear()}-01-01`;
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    // Today sales
    const todayAgg = await db('sales')
      .where({ dealer_id: dealerId })
      .where('sale_date', '>=', todayStr)
      .select(
        db.raw('COALESCE(SUM(total_amount), 0) AS sales'),
        db.raw('COALESCE(SUM(net_profit), 0) AS profit'),
        db.raw('COALESCE(SUM(total_sft), 0) AS sft'),
      )
      .first();

    // Today collection
    const todayColl = await db('customer_ledger')
      .where({ dealer_id: dealerId, type: 'payment' })
      .where('entry_date', '>=', todayStr)
      .sum({ s: 'amount' })
      .first();

    // Monthly aggregates
    const monthAgg = await db('sales')
      .where({ dealer_id: dealerId })
      .where('sale_date', '>=', monthStart)
      .select(
        db.raw('COALESCE(SUM(total_amount), 0) AS sales'),
        db.raw('COALESCE(SUM(net_profit), 0) AS profit'),
      )
      .first();

    const monthColl = await db('customer_ledger')
      .where({ dealer_id: dealerId, type: 'payment' })
      .where('entry_date', '>=', monthStart)
      .sum({ s: 'amount' })
      .first();

    const monthPurchase = await db('purchases')
      .where({ dealer_id: dealerId })
      .where('purchase_date', '>=', monthStart)
      .sum({ s: 'total_amount' })
      .first();

    // Customer due (sum of due_amount across sales) and supplier payable
    const custDue = await db('sales')
      .where({ dealer_id: dealerId })
      .sum({ s: 'due_amount' })
      .first();

    const supplierPay = await db('supplier_ledger')
      .where({ dealer_id: dealerId })
      .select(db.raw(`
        COALESCE(SUM(CASE WHEN type IN ('purchase','adjustment') THEN amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) AS payable
      `))
      .first() as any;

    // Total stock value: sum(box_qty or piece_qty * cost_price)
    const stockValRow = await db.raw(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN p.unit_type = 'box_sft' THEN COALESCE(s.box_qty, 0) * COALESCE(p.cost_price, 0)
          ELSE COALESCE(s.piece_qty, 0) * COALESCE(p.cost_price, 0)
        END
      ), 0) AS v
      FROM products p
      LEFT JOIN stock s ON s.product_id = p.id AND s.dealer_id = p.dealer_id
      WHERE p.dealer_id = ?
      `,
      [dealerId],
    );
    const totalStockValue = round2(stockValRow.rows?.[0]?.v ?? 0);

    // Low-stock items (qty <= reorder_level), top 10
    const lowStockRows = await db.raw(
      `
      SELECT p.id, p.name, p.sku, p.category,
             CASE WHEN p.unit_type = 'box_sft'
                  THEN COALESCE(s.box_qty, 0)
                  ELSE COALESCE(s.piece_qty, 0)
             END AS current_qty,
             COALESCE(p.reorder_level, 0) AS reorder_level
      FROM products p
      LEFT JOIN stock s ON s.product_id = p.id AND s.dealer_id = p.dealer_id
      WHERE p.dealer_id = ?
        AND COALESCE(p.reorder_level, 0) > 0
        AND (CASE WHEN p.unit_type = 'box_sft'
                  THEN COALESCE(s.box_qty, 0)
                  ELSE COALESCE(s.piece_qty, 0)
             END) <= COALESCE(p.reorder_level, 0)
      ORDER BY current_qty ASC
      LIMIT 10
      `,
      [dealerId],
    );
    const lowStockItems = (lowStockRows.rows ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      category: r.category ?? '',
      currentQty: round2(r.current_qty),
      reorderLevel: round2(r.reorder_level),
    }));

    // Overdue customers: due > 0 AND oldest unpaid sale > 30 days
    const overdueRow = await db.raw(
      `
      SELECT COUNT(DISTINCT customer_id)::int AS c
      FROM sales
      WHERE dealer_id = ?
        AND due_amount > 0
        AND sale_date < (CURRENT_DATE - INTERVAL '30 days')
      `,
      [dealerId],
    );

    // Monthly sales chart (current year)
    const chartRows = await db.raw(
      `
      SELECT EXTRACT(MONTH FROM sale_date)::int AS m,
             COALESCE(SUM(total_amount), 0) AS amount
      FROM sales
      WHERE dealer_id = ? AND sale_date >= ?
      GROUP BY 1
      `,
      [dealerId, yearStart],
    );
    const chartByMonth: Record<number, number> = {};
    (chartRows.rows ?? []).forEach((r: any) => { chartByMonth[Number(r.m)] = round2(r.amount); });
    const monthlySalesChart = MONTHS.map((month, i) => ({
      month,
      amount: chartByMonth[i + 1] ?? 0,
    }));

    // Top customers (by total billed this year)
    const topCustRows = await db.raw(
      `
      SELECT c.name, COALESCE(SUM(s.total_amount), 0) AS amount
      FROM sales s
      JOIN customers c ON c.id = s.customer_id
      WHERE s.dealer_id = ? AND s.sale_date >= ?
      GROUP BY c.id, c.name
      ORDER BY amount DESC
      LIMIT 5
      `,
      [dealerId, yearStart],
    );
    const topCustomers = (topCustRows.rows ?? []).map((r: any) => ({
      name: r.name,
      amount: round2(r.amount),
    }));

    // Product performance (top 5 by total revenue this year)
    const prodRows = await db.raw(
      `
      SELECT p.name, COALESCE(SUM(si.total), 0) AS amount
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE si.dealer_id = ? AND s.sale_date >= ?
      GROUP BY p.id, p.name
      ORDER BY amount DESC
      LIMIT 5
      `,
      [dealerId, yearStart],
    );
    const productPerformance = (prodRows.rows ?? []).map((r: any) => ({
      name: r.name,
      amount: round2(r.amount),
    }));

    // Category breakdown
    const catRows = await db.raw(
      `
      SELECT COALESCE(p.category, 'Other') AS category,
             COALESCE(SUM(si.total), 0) AS amount
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE si.dealer_id = ? AND s.sale_date >= ?
      GROUP BY 1
      ORDER BY amount DESC
      `,
      [dealerId, yearStart],
    );
    const categorySales = (catRows.rows ?? []).map((r: any) => ({
      category: r.category,
      amount: round2(r.amount),
    }));

    res.json({
      todaySales: round2(todayAgg?.sales),
      todayCollection: round2(todayColl?.s),
      todayProfit: round2(todayAgg?.profit),
      todaySftSold: round2(todayAgg?.sft),
      monthlySales: round2(monthAgg?.sales),
      monthlyCollection: round2(monthColl?.s),
      monthlyProfit: round2(monthAgg?.profit),
      monthlyPurchase: round2(monthPurchase?.s),
      totalCustomerDue: round2(custDue?.s),
      totalSupplierPayable: round2(supplierPay?.payable),
      cashInHand: 0, // computed elsewhere; left at 0 until cash_ledger endpoint lands
      totalStockValue,
      lowStockItems,
      overdueCustomerCount: Number(overdueRow.rows?.[0]?.c ?? 0),
      creditExceededCount: 0, // requires credit_limits join — Phase 2.1
      deadStockCount: 0,      // 90-day no-sale calc — Phase 2.1
      monthlySalesChart,
      categorySales,
      topCustomers,
      productPerformance,
    });
  } catch (err) {
    console.error('[dashboard] error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ── GET /api/dashboard/onboarding-counts ──────────────────────────────────
router.get('/onboarding-counts', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;

  try {
    const [products, customers, suppliers, sales] = await Promise.all([
      db('products').where({ dealer_id: dealerId }).count<{ count: string }[]>('* as count').first(),
      db('customers').where({ dealer_id: dealerId }).count<{ count: string }[]>('* as count').first(),
      db('suppliers').where({ dealer_id: dealerId }).count<{ count: string }[]>('* as count').first(),
      db('sales').where({ dealer_id: dealerId }).count<{ count: string }[]>('* as count').first(),
    ]);
    res.json({
      products: Number(products?.count ?? 0),
      customers: Number(customers?.count ?? 0),
      suppliers: Number(suppliers?.count ?? 0),
      sales: Number(sales?.count ?? 0),
    });
  } catch (err: any) {
    console.error('[dashboard/onboarding-counts]', err.message);
    res.status(500).json({ error: 'Failed to load onboarding counts' });
  }
});

// ── GET /api/dashboard/quotation-widgets ──────────────────────────────────
router.get('/quotation-widgets', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;

  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    const in7Str = in7.toISOString().split('T')[0];
    const ago30 = new Date(today); ago30.setDate(ago30.getDate() - 30);
    const ago30Str = ago30.toISOString().split('T')[0];

    const activeRow = await db('quotations')
      .where({ dealer_id: dealerId, status: 'active' })
      .sum({ s: 'total_amount' })
      .first();

    const expiringRows = await db('quotations')
      .where({ dealer_id: dealerId, status: 'active' })
      .whereBetween('valid_until', [todayStr, in7Str])
      .select('total_amount');

    const convertedRows = await db('quotations')
      .where({ dealer_id: dealerId, status: 'converted' })
      .where('converted_at', '>=', `${ago30Str}T00:00:00`)
      .select('total_amount');

    const recentRows = await db('quotations')
      .where({ dealer_id: dealerId })
      .where('quote_date', '>=', ago30Str)
      .select('status');

    const expiringCount = expiringRows.length;
    const expiringValue = expiringRows.reduce((s, r: any) => s + Number(r.total_amount || 0), 0);
    const convertedCount = convertedRows.length;
    const convertedValue = convertedRows.reduce((s, r: any) => s + Number(r.total_amount || 0), 0);
    const finalized = recentRows.filter((r: any) => r.status !== 'draft' && r.status !== 'cancelled').length;
    const convertedRecent = recentRows.filter((r: any) => r.status === 'converted').length;
    const conversionPct = finalized > 0 ? (convertedRecent / finalized) * 100 : 0;

    res.json({
      activeValue: round2(activeRow?.s),
      expiringCount,
      expiringValue: round2(expiringValue),
      convertedCount,
      convertedValue: round2(convertedValue),
      conversionPct: round2(conversionPct),
    });
  } catch (err: any) {
    console.error('[dashboard/quotation-widgets]', err.message);
    res.status(500).json({ error: 'Failed to load quotation widgets' });
  }
});

// ── GET /api/dashboard/delivery-summary ───────────────────────────────────
router.get('/delivery-summary', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;

  try {
    const today = new Date().toISOString().split('T')[0];
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

    const rows = await db('challans')
      .where({ dealer_id: dealerId })
      .whereNot('status', 'cancelled')
      .select('id', 'delivery_status', 'challan_date', 'status');

    const pending = rows.filter((c: any) => c.delivery_status === 'pending').length;
    const dispatchedToday = rows.filter(
      (c: any) => c.delivery_status === 'dispatched' && String(c.challan_date).slice(0, 10) === today,
    ).length;
    const deliveredToday = rows.filter(
      (c: any) => c.delivery_status === 'delivered' && String(c.challan_date).slice(0, 10) === today,
    ).length;
    const late = rows.filter(
      (c: any) => c.delivery_status === 'pending' && String(c.challan_date).slice(0, 10) <= twoDaysAgo,
    ).length;

    res.json({ pending, dispatchedToday, deliveredToday, late });
  } catch (err: any) {
    console.error('[dashboard/delivery-summary]', err.message);
    res.status(500).json({ error: 'Failed to load delivery summary' });
  }
});

// ── GET /api/dashboard/top-overdue ────────────────────────────────────────
router.get('/top-overdue', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;

  try {
    const [custs, ledger] = await Promise.all([
      db('customers')
        .where({ dealer_id: dealerId, status: 'active' })
        .select('id', 'name', 'phone', 'max_overdue_days'),
      db('customer_ledger')
        .where({ dealer_id: dealerId })
        .select('customer_id', 'amount', 'type', 'entry_date'),
    ]);

    const dueMap = new Map<string, { outstanding: number; oldestSaleDate: string | null }>();
    for (const e of ledger as any[]) {
      const cur = dueMap.get(e.customer_id) ?? { outstanding: 0, oldestSaleDate: null };
      const amt = Number(e.amount) || 0;
      const dateStr = e.entry_date ? String(e.entry_date).slice(0, 10) : null;
      if (e.type === 'sale') {
        cur.outstanding += amt;
        if (dateStr && (!cur.oldestSaleDate || dateStr < cur.oldestSaleDate)) cur.oldestSaleDate = dateStr;
      } else if (e.type === 'payment' || e.type === 'refund') {
        cur.outstanding -= amt;
      } else if (e.type === 'adjustment') {
        cur.outstanding += amt;
      }
      dueMap.set(e.customer_id, cur);
    }

    const today = new Date();
    const out = (custs as any[])
      .map((c) => {
        const info = dueMap.get(c.id);
        const outstanding = round2(info?.outstanding ?? 0);
        const daysOverdue = info?.oldestSaleDate
          ? Math.floor((today.getTime() - new Date(info.oldestSaleDate).getTime()) / 86400000)
          : 0;
        return { id: c.id, name: c.name, phone: c.phone, outstanding, daysOverdue };
      })
      .filter((c) => c.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5);

    res.json({ rows: out });
  } catch (err: any) {
    console.error('[dashboard/top-overdue]', err.message);
    res.status(500).json({ error: 'Failed to load top overdue customers' });
  }
});

// ── GET /api/dashboard/latest-suppliers ───────────────────────────────────
router.get('/latest-suppliers', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;

  try {
    const rows = await db('suppliers')
      .where({ dealer_id: dealerId })
      .select('id', 'name', 'phone', 'status', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(5);
    res.json({ rows });
  } catch (err: any) {
    console.error('[dashboard/latest-suppliers]', err.message);
    res.status(500).json({ error: 'Failed to load latest suppliers' });
  }
});

// ── GET /api/dashboard/customer-due-balances?ids=a,b,c ────────────────────
router.get('/customer-due-balances', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;

  try {
    const idsParam = (req.query.ids as string | undefined) || '';
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length) {
      res.json({ rows: {} });
      return;
    }

    const [ledger, sales] = await Promise.all([
      db('customer_ledger')
        .where({ dealer_id: dealerId })
        .whereIn('customer_id', ids)
        .select('customer_id', 'amount', 'type'),
      db('sales')
        .where({ dealer_id: dealerId })
        .whereIn('customer_id', ids)
        .where('due_amount', '>', 0)
        .orderBy('sale_date', 'asc')
        .select('customer_id', 'sale_date', 'due_amount'),
    ]);

    const sums: Record<string, { due: number; daysOverdue: number }> = {};
    for (const r of ledger as any[]) {
      const amt = Number(r.amount) || 0;
      if (!sums[r.customer_id]) sums[r.customer_id] = { due: 0, daysOverdue: 0 };
      if (r.type === 'sale') sums[r.customer_id].due += amt;
      else if (r.type === 'payment' || r.type === 'refund') sums[r.customer_id].due -= amt;
      else if (r.type === 'adjustment') sums[r.customer_id].due += amt;
    }

    const today = new Date();
    const oldest = new Map<string, string>();
    for (const s of sales as any[]) {
      if (!oldest.has(s.customer_id)) oldest.set(s.customer_id, String(s.sale_date).slice(0, 10));
    }
    for (const [cid, date] of oldest) {
      if (sums[cid]) {
        sums[cid].daysOverdue = Math.max(0, Math.floor((today.getTime() - new Date(date).getTime()) / 86400000));
      }
    }
    // round dues
    for (const k of Object.keys(sums)) sums[k].due = round2(sums[k].due);

    res.json({ rows: sums });
  } catch (err: any) {
    console.error('[dashboard/customer-due-balances]', err.message);
    res.status(500).json({ error: 'Failed to load customer due balances' });
  }
});

// ── GET /api/dashboard/latest-sales ───────────────────────────────────────
router.get('/latest-sales', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  try {
    const rows = await db('sales')
      .leftJoin('customers', 'customers.id', 'sales.customer_id')
      .where('sales.dealer_id', dealerId)
      .select(
        'sales.id',
        'sales.sale_date',
        'sales.invoice_number',
        'sales.total_amount',
        'sales.paid_amount',
        'sales.due_amount',
        'sales.sale_status',
        db.raw("json_build_object('name', customers.name) AS customers"),
      )
      .orderBy('sales.created_at', 'desc')
      .limit(5);
    res.json({ rows });
  } catch (err: any) {
    console.error('[dashboard/latest-sales]', err.message);
    res.status(500).json({ error: 'Failed to load latest sales' });
  }
});

// ── GET /api/dashboard/latest-purchases ───────────────────────────────────
router.get('/latest-purchases', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  try {
    const rows = await db('purchases')
      .leftJoin('suppliers', 'suppliers.id', 'purchases.supplier_id')
      .where('purchases.dealer_id', dealerId)
      .select(
        'purchases.id',
        'purchases.purchase_date',
        'purchases.invoice_number',
        'purchases.total_amount',
        db.raw("json_build_object('name', suppliers.name) AS suppliers"),
      )
      .orderBy('purchases.created_at', 'desc')
      .limit(5);
    res.json({ rows });
  } catch (err: any) {
    console.error('[dashboard/latest-purchases]', err.message);
    res.status(500).json({ error: 'Failed to load latest purchases' });
  }
});

// ── GET /api/dashboard/latest-customers ───────────────────────────────────
router.get('/latest-customers', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  try {
    const rows = await db('customers')
      .where({ dealer_id: dealerId })
      .select('id', 'name', 'phone', 'type', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(5);
    res.json({ rows });
  } catch (err: any) {
    console.error('[dashboard/latest-customers]', err.message);
    res.status(500).json({ error: 'Failed to load latest customers' });
  }
});

export default router;
