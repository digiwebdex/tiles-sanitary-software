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

export default router;
