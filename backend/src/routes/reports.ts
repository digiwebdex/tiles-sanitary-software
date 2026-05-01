/**
 * Reports REST routes — VPS migration phase 3J (reads only).
 *
 * Mirrors all 10 functions in `src/services/reportService.ts`:
 *   GET /api/reports/stock?dealerId=&page=&search=
 *   GET /api/reports/products?dealerId=&page=&search=
 *   GET /api/reports/brand-stock?dealerId=
 *   GET /api/reports/sales?dealerId=&mode=daily|monthly&year=&month=
 *   GET /api/reports/retailer-sales?dealerId=&year=&customerType=
 *   GET /api/reports/product-history?dealerId=&productId=&page=
 *   GET /api/reports/customer-due?dealerId=&page=
 *   GET /api/reports/supplier-payable?dealerId=&page=
 *   GET /api/reports/accounting-summary?dealerId=&year=
 *   GET /api/reports/inventory-aging?dealerId=
 *   GET /api/reports/low-stock?dealerId=
 *
 * All routes are dealer-scoped. Reports are RLS-equivalent via the
 * tenantGuard + explicit dealerId filter on every query.
 *
 * Cost / margin data is restricted to dealer_admin / super_admin —
 * salesman role gets a 403 to mirror the dashboard server-side gate.
 */
import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';
import { hasRole } from '../middleware/roles';

const router = Router();
router.use(authenticate, tenantGuard);

const PAGE_SIZE = 25;
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

/** Block salesman from financial / margin reports. */
function requireFinancialRole(req: Request, res: Response): boolean {
  if (hasRole(req, 'dealer_admin') || hasRole(req, 'super_admin')) return true;
  res.status(403).json({ error: 'Reports require dealer_admin role' });
  return false;
}

// ─── 1. Stock Report ──────────────────────────────────────────────────────
router.get('/stock', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const search = ((req.query.search as string) || '').trim();

  try {
    let pq = db('products')
      .where({ dealer_id: dealerId, active: true })
      .orderBy('sku');
    if (search) {
      pq = pq.andWhere(function () {
        this.whereILike('sku', `%${search}%`)
          .orWhereILike('name', `%${search}%`)
          .orWhereILike('brand', `%${search}%`);
      });
    }
    const [{ count }] = await pq
      .clone()
      .clearSelect()
      .clearOrder()
      .count<{ count: string }[]>('id as count');

    const products = await pq
      .clone()
      .select('id', 'sku', 'name', 'brand', 'category', 'unit_type', 'reorder_level')
      .offset((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE);

    const ids = products.map((p) => p.id);
    if (!ids.length) {
      res.json({ rows: [], total: 0 });
      return;
    }

    const stocks = await db('stock')
      .whereIn('product_id', ids)
      .andWhere({ dealer_id: dealerId })
      .select('product_id', 'box_qty', 'sft_qty', 'piece_qty', 'average_cost_per_unit');
    const sm = new Map(stocks.map((s: any) => [s.product_id, s]));

    const rows = products.map((p: any) => {
      const s: any = sm.get(p.id);
      const boxQty = Number(s?.box_qty ?? 0);
      const sftQty = Number(s?.sft_qty ?? 0);
      const pieceQty = Number(s?.piece_qty ?? 0);
      const avgCost = Number(s?.average_cost_per_unit ?? 0);
      const totalQty = boxQty + pieceQty;
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        category: p.category,
        unitType: p.unit_type,
        boxQty,
        sftQty,
        pieceQty,
        avgCost,
        stockValue: round2(totalQty * avgCost),
        reorderLevel: Number(p.reorder_level ?? 0),
        isLow: totalQty <= Number(p.reorder_level ?? 0),
      };
    });

    res.json({ rows, total: Number(count) || 0 });
  } catch (err) {
    console.error('[reports.stock]', err);
    res.status(500).json({ error: 'Failed to load stock report' });
  }
});

// ─── 2. Products Report ───────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const search = ((req.query.search as string) || '').trim();

  try {
    let pq = db('products')
      .where({ dealer_id: dealerId, active: true })
      .orderBy('sku');
    if (search) {
      pq = pq.andWhere(function () {
        this.whereILike('sku', `%${search}%`)
          .orWhereILike('name', `%${search}%`)
          .orWhereILike('brand', `%${search}%`);
      });
    }
    const [{ count }] = await pq
      .clone()
      .clearSelect()
      .clearOrder()
      .count<{ count: string }[]>('id as count');

    const products = await pq
      .clone()
      .select('id', 'sku', 'name', 'brand', 'category', 'unit_type', 'per_box_sft')
      .offset((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE);

    const ids = products.map((p) => p.id);
    if (!ids.length) {
      res.json({ rows: [], total: 0 });
      return;
    }

    const [purchaseRows, saleRows, stockRows] = await Promise.all([
      db('purchase_items')
        .where({ dealer_id: dealerId })
        .whereIn('product_id', ids)
        .select('product_id')
        .sum({ qty: 'quantity' })
        .sum({ amount: 'total' })
        .groupBy('product_id'),
      db('sale_items')
        .where({ dealer_id: dealerId })
        .whereIn('product_id', ids)
        .select('product_id')
        .sum({ qty: 'quantity' })
        .sum({ amount: 'total' })
        .groupBy('product_id'),
      db('stock')
        .where({ dealer_id: dealerId })
        .whereIn('product_id', ids)
        .select('product_id', 'box_qty', 'piece_qty', 'average_cost_per_unit'),
    ]);

    const purMap = new Map(purchaseRows.map((r: any) => [r.product_id, r]));
    const saleMap = new Map(saleRows.map((r: any) => [r.product_id, r]));
    const stockMap = new Map(stockRows.map((s: any) => [s.product_id, s]));

    const rows = products.map((p: any) => {
      const pur: any = purMap.get(p.id) ?? { qty: 0, amount: 0 };
      const sld: any = saleMap.get(p.id) ?? { qty: 0, amount: 0 };
      const st: any = stockMap.get(p.id);
      const stockQty = Number(st?.box_qty ?? 0) + Number(st?.piece_qty ?? 0);
      const avgCost = Number(st?.average_cost_per_unit ?? 0);
      const cogs = Number(sld.qty) * avgCost;
      return {
        productId: p.id,
        sku: p.sku,
        name: `${p.name}${p.category === 'tiles' && p.per_box_sft ? ` (Box: ${p.per_box_sft}sft)` : ''}`,
        purchasedQty: Number(pur.qty),
        purchasedAmount: round2(Number(pur.amount)),
        soldQty: Number(sld.qty),
        soldAmount: round2(Number(sld.amount)),
        profitOrLoss: round2(Number(sld.amount) - cogs),
        stockQty,
        stockAmount: round2(stockQty * avgCost),
      };
    });

    res.json({ rows, total: Number(count) || 0 });
  } catch (err) {
    console.error('[reports.products]', err);
    res.status(500).json({ error: 'Failed to load products report' });
  }
});

// ─── 3. Brand Stock Report ────────────────────────────────────────────────
router.get('/brand-stock', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  try {
    const products = await db('products')
      .where({ dealer_id: dealerId, active: true })
      .select('id', 'brand', 'unit_type');

    const ids = products.map((p: any) => p.id);
    if (!ids.length) {
      res.json([]);
      return;
    }

    const [stocks, purItems, saleItems] = await Promise.all([
      db('stock')
        .where({ dealer_id: dealerId })
        .whereIn('product_id', ids)
        .select('product_id', 'box_qty', 'sft_qty', 'piece_qty', 'average_cost_per_unit'),
      db('purchase_items')
        .where({ dealer_id: dealerId })
        .whereIn('product_id', ids)
        .select('product_id', 'quantity', 'total'),
      db('sale_items')
        .where({ dealer_id: dealerId })
        .whereIn('product_id', ids)
        .select('product_id', 'quantity', 'total'),
    ]);

    const stockMap = new Map(stocks.map((s: any) => [s.product_id, s]));
    const purMap: Record<string, { qty: number; amount: number }> = {};
    for (const pi of purItems) {
      const k = (pi as any).product_id;
      if (!purMap[k]) purMap[k] = { qty: 0, amount: 0 };
      purMap[k].qty += Number((pi as any).quantity);
      purMap[k].amount += Number((pi as any).total);
    }
    const sldMap: Record<string, { qty: number; amount: number }> = {};
    for (const si of saleItems) {
      const k = (si as any).product_id;
      if (!sldMap[k]) sldMap[k] = { qty: 0, amount: 0 };
      sldMap[k].qty += Number((si as any).quantity);
      sldMap[k].amount += Number((si as any).total);
    }

    const brandMap: Record<string, any> = {};
    for (const p of products as any[]) {
      const brand = p.brand || 'Others';
      if (!brandMap[brand]) {
        brandMap[brand] = {
          brand, totalBox: 0, totalSft: 0, totalPiece: 0, totalValue: 0, productCount: 0,
          purchasedQty: 0, purchasedAmount: 0, soldQty: 0, soldAmount: 0, profitOrLoss: 0,
        };
      }
      const s: any = stockMap.get(p.id);
      const boxQty = Number(s?.box_qty ?? 0);
      const sftQty = Number(s?.sft_qty ?? 0);
      const pieceQty = Number(s?.piece_qty ?? 0);
      const avgCost = Number(s?.average_cost_per_unit ?? 0);
      brandMap[brand].totalBox += boxQty;
      brandMap[brand].totalSft += sftQty;
      brandMap[brand].totalPiece += pieceQty;
      brandMap[brand].totalValue += (boxQty + pieceQty) * avgCost;
      brandMap[brand].productCount += 1;
      const pur = purMap[p.id] ?? { qty: 0, amount: 0 };
      const sld = sldMap[p.id] ?? { qty: 0, amount: 0 };
      brandMap[brand].purchasedQty += pur.qty;
      brandMap[brand].purchasedAmount += pur.amount;
      brandMap[brand].soldQty += sld.qty;
      brandMap[brand].soldAmount += sld.amount;
      brandMap[brand].profitOrLoss += sld.amount - (sld.qty * avgCost);
    }

    res.json(
      Object.values(brandMap)
        .map((b: any) => ({
          ...b,
          totalValue: round2(b.totalValue),
          totalSft: round2(b.totalSft),
          purchasedAmount: round2(b.purchasedAmount),
          soldAmount: round2(b.soldAmount),
          profitOrLoss: round2(b.profitOrLoss),
        }))
        .sort((a: any, b: any) => b.totalValue - a.totalValue),
    );
  } catch (err) {
    console.error('[reports.brand-stock]', err);
    res.status(500).json({ error: 'Failed to load brand stock report' });
  }
});

// ─── 4. Sales Report (daily/monthly) ──────────────────────────────────────
router.get('/sales', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  const mode = (req.query.mode as string) === 'monthly' ? 'monthly' : 'daily';
  const year = parseInt((req.query.year as string) || `${new Date().getFullYear()}`, 10);
  const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined;

  try {
    let q = db('sales')
      .where({ dealer_id: dealerId })
      .select('sale_date', 'total_amount', 'paid_amount', 'profit', 'due_amount', 'total_sft')
      .orderBy('sale_date');
    if (mode === 'daily' && month) {
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
      q = q.andWhere('sale_date', '>=', start).andWhere('sale_date', '<=', end);
    } else {
      q = q.andWhere('sale_date', '>=', `${year}-01-01`).andWhere('sale_date', '<=', `${year}-12-31`);
    }
    const data = await q;

    const buckets: Record<string, any> = {};
    for (const row of data as any[]) {
      const d = String(row.sale_date).substring(0, 10);
      const key = mode === 'daily' ? d : d.substring(0, 7);
      if (!buckets[key]) {
        buckets[key] = { date: key, count: 0, totalAmount: 0, totalCollection: 0, totalProfit: 0, totalDue: 0, totalSft: 0 };
      }
      buckets[key].count += 1;
      buckets[key].totalAmount += Number(row.total_amount);
      buckets[key].totalCollection += Number(row.paid_amount);
      buckets[key].totalProfit += Number(row.profit ?? 0);
      buckets[key].totalDue += Number(row.due_amount ?? 0);
      buckets[key].totalSft += Number(row.total_sft ?? 0);
    }

    res.json(
      Object.values(buckets)
        .sort((a: any, b: any) => a.date.localeCompare(b.date))
        .map((b: any) => ({
          ...b,
          totalAmount: round2(b.totalAmount),
          totalCollection: round2(b.totalCollection),
          totalProfit: round2(b.totalProfit),
          totalDue: round2(b.totalDue),
          totalSft: round2(b.totalSft),
        })),
    );
  } catch (err) {
    console.error('[reports.sales]', err);
    res.status(500).json({ error: 'Failed to load sales report' });
  }
});

// ─── 5. Retailer Sales Report ─────────────────────────────────────────────
router.get('/retailer-sales', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  const year = parseInt((req.query.year as string) || `${new Date().getFullYear()}`, 10);
  const customerType = req.query.customerType as string | undefined;

  try {
    let q = db('sales as s')
      .leftJoin('customers as c', 'c.id', 's.customer_id')
      .where('s.dealer_id', dealerId)
      .andWhere('s.sale_date', '>=', `${year}-01-01`)
      .andWhere('s.sale_date', '<=', `${year}-12-31`)
      .select('s.customer_id', 's.total_sft', 's.total_amount', 's.due_amount', 'c.name as cust_name', 'c.type as cust_type');
    if (customerType) q = q.andWhere('c.type', customerType);
    const data = await q;

    const map: Record<string, any> = {};
    for (const row of data as any[]) {
      const cid = row.customer_id;
      if (!map[cid]) {
        map[cid] = {
          customerId: cid,
          customerName: row.cust_name ?? '—',
          customerType: row.cust_type ?? 'customer',
          totalSft: 0, totalAmount: 0, totalDue: 0, saleCount: 0,
        };
      }
      map[cid].totalSft += Number(row.total_sft ?? 0);
      map[cid].totalAmount += Number(row.total_amount);
      map[cid].totalDue += Number(row.due_amount ?? 0);
      map[cid].saleCount += 1;
    }

    res.json(
      Object.values(map)
        .map((r: any) => ({
          ...r,
          totalSft: round2(r.totalSft),
          totalAmount: round2(r.totalAmount),
          totalDue: round2(r.totalDue),
        }))
        .sort((a: any, b: any) => b.totalSft - a.totalSft),
    );
  } catch (err) {
    console.error('[reports.retailer-sales]', err);
    res.status(500).json({ error: 'Failed to load retailer sales report' });
  }
});

// ─── 6. Product History ───────────────────────────────────────────────────
router.get('/product-history', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  const productId = req.query.productId as string;
  if (!productId) {
    res.status(400).json({ error: 'productId required' });
    return;
  }
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));

  try {
    const [purchases, sales, returns] = await Promise.all([
      db('purchase_items as pi')
        .leftJoin('purchases as p', 'p.id', 'pi.purchase_id')
        .where({ 'pi.dealer_id': dealerId, 'pi.product_id': productId })
        .select('pi.id', 'pi.quantity', 'pi.purchase_rate', 'pi.total', 'p.purchase_date', 'p.invoice_number'),
      db('sale_items as si')
        .leftJoin('sales as s', 's.id', 'si.sale_id')
        .where({ 'si.dealer_id': dealerId, 'si.product_id': productId })
        .select('si.id', 'si.quantity', 'si.sale_rate', 'si.total', 's.sale_date', 's.invoice_number'),
      db('sales_returns as sr')
        .leftJoin('sales as s', 's.id', 'sr.sale_id')
        .where({ 'sr.dealer_id': dealerId, 'sr.product_id': productId })
        .select('sr.id', 'sr.qty', 'sr.refund_amount', 'sr.return_date', 'sr.is_broken', 's.invoice_number'),
    ]);

    const rows: any[] = [];
    for (const pi of purchases as any[]) {
      rows.push({
        id: pi.id,
        date: pi.purchase_date ? String(pi.purchase_date).substring(0, 10) : '',
        type: 'purchase',
        quantity: Number(pi.quantity),
        rate: Number(pi.purchase_rate),
        total: Number(pi.total),
        reference: pi.invoice_number ?? '—',
      });
    }
    for (const si of sales as any[]) {
      rows.push({
        id: si.id,
        date: si.sale_date ? String(si.sale_date).substring(0, 10) : '',
        type: 'sale',
        quantity: Number(si.quantity),
        rate: Number(si.sale_rate),
        total: Number(si.total),
        reference: si.invoice_number ?? '—',
      });
    }
    for (const sr of returns as any[]) {
      rows.push({
        id: sr.id,
        date: sr.return_date ? String(sr.return_date).substring(0, 10) : '',
        type: 'return',
        quantity: Number(sr.qty),
        rate: 0,
        total: Number(sr.refund_amount),
        reference: `${sr.invoice_number ?? '—'}${sr.is_broken ? ' (broken)' : ''}`,
      });
    }

    rows.sort((a, b) => b.date.localeCompare(a.date));
    const total = rows.length;
    const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    res.json({ rows: paged, total });
  } catch (err) {
    console.error('[reports.product-history]', err);
    res.status(500).json({ error: 'Failed to load product history' });
  }
});

// ─── 7. Customer Due Report ───────────────────────────────────────────────
router.get('/customer-due', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));

  try {
    const [ledger, customers] = await Promise.all([
      db('customer_ledger').where({ dealer_id: dealerId }).select('customer_id', 'amount'),
      db('customers').where({ dealer_id: dealerId }).select('id', 'name', 'type'),
    ]);
    const cm = new Map(customers.map((c: any) => [c.id, c]));
    const balances: Record<string, { debit: number; credit: number }> = {};
    for (const e of ledger as any[]) {
      const cid = e.customer_id;
      if (!balances[cid]) balances[cid] = { debit: 0, credit: 0 };
      const amt = Number(e.amount);
      if (amt >= 0) balances[cid].debit += amt;
      else balances[cid].credit += Math.abs(amt);
    }
    const all = Object.entries(balances)
      .map(([cid, b]) => {
        const c: any = cm.get(cid);
        return {
          customerId: cid,
          customerName: c?.name ?? '—',
          customerType: c?.type ?? 'customer',
          totalDebit: round2(b.debit),
          totalCredit: round2(b.credit),
          balance: round2(b.debit - b.credit),
        };
      })
      .filter((r) => r.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    res.json({
      rows: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      total: all.length,
    });
  } catch (err) {
    console.error('[reports.customer-due]', err);
    res.status(500).json({ error: 'Failed to load customer due report' });
  }
});

// ─── 8. Supplier Payable Report ───────────────────────────────────────────
router.get('/supplier-payable', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));

  try {
    const [ledger, suppliers] = await Promise.all([
      db('supplier_ledger').where({ dealer_id: dealerId }).select('supplier_id', 'amount'),
      db('suppliers').where({ dealer_id: dealerId }).select('id', 'name'),
    ]);
    const sm = new Map(suppliers.map((s: any) => [s.id, s]));
    const balances: Record<string, { debit: number; credit: number }> = {};
    for (const e of ledger as any[]) {
      const sid = e.supplier_id;
      if (!balances[sid]) balances[sid] = { debit: 0, credit: 0 };
      const amt = Number(e.amount);
      if (amt >= 0) balances[sid].debit += amt;
      else balances[sid].credit += Math.abs(amt);
    }
    const all = Object.entries(balances)
      .map(([sid, b]) => {
        const s: any = sm.get(sid);
        return {
          supplierId: sid,
          supplierName: s?.name ?? '—',
          totalDebit: round2(b.debit),
          totalCredit: round2(b.credit),
          balance: round2(b.credit - b.debit),
        };
      })
      .filter((r) => r.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    res.json({
      rows: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      total: all.length,
    });
  } catch (err) {
    console.error('[reports.supplier-payable]', err);
    res.status(500).json({ error: 'Failed to load supplier payable report' });
  }
});

// ─── 9. Accounting Summary ────────────────────────────────────────────────
router.get('/accounting-summary', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;
  const year = parseInt((req.query.year as string) || `${new Date().getFullYear()}`, 10);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  try {
    const [sales, purchases, expenses, cash] = await Promise.all([
      db('sales')
        .where({ dealer_id: dealerId })
        .andWhere('sale_date', '>=', yearStart).andWhere('sale_date', '<=', yearEnd)
        .select('sale_date', 'total_amount', 'paid_amount', 'profit', 'due_amount', 'total_sft'),
      db('purchases')
        .where({ dealer_id: dealerId })
        .andWhere('purchase_date', '>=', yearStart).andWhere('purchase_date', '<=', yearEnd)
        .select('purchase_date', 'total_amount'),
      db('expenses')
        .where({ dealer_id: dealerId })
        .andWhere('expense_date', '>=', yearStart).andWhere('expense_date', '<=', yearEnd)
        .select('expense_date', 'amount'),
      db('cash_ledger')
        .where({ dealer_id: dealerId })
        .andWhere('entry_date', '>=', yearStart).andWhere('entry_date', '<=', yearEnd)
        .select('entry_date', 'amount'),
    ]);

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const buckets = MONTHS.map((m) => ({
      month: m, totalSales: 0, totalCollection: 0, totalDue: 0, totalSftSold: 0,
      totalPurchases: 0, totalExpenses: 0, netProfit: 0, cashIn: 0, cashOut: 0,
    }));
    for (const r of sales as any[]) {
      const m = new Date(r.sale_date).getMonth();
      buckets[m].totalSales += Number(r.total_amount);
      buckets[m].totalCollection += Number(r.paid_amount);
      buckets[m].totalDue += Number(r.due_amount ?? 0);
      buckets[m].totalSftSold += Number(r.total_sft ?? 0);
      buckets[m].netProfit += Number(r.profit ?? 0);
    }
    for (const r of purchases as any[]) {
      const m = new Date(r.purchase_date).getMonth();
      buckets[m].totalPurchases += Number(r.total_amount);
    }
    for (const r of expenses as any[]) {
      const m = new Date(r.expense_date).getMonth();
      buckets[m].totalExpenses += Number(r.amount);
    }
    for (const r of cash as any[]) {
      const m = new Date(r.entry_date).getMonth();
      const amt = Number(r.amount);
      if (amt >= 0) buckets[m].cashIn += amt;
      else buckets[m].cashOut += Math.abs(amt);
    }

    res.json(buckets.map((b) => ({
      ...b,
      totalSales: round2(b.totalSales),
      totalCollection: round2(b.totalCollection),
      totalDue: round2(b.totalDue),
      totalSftSold: round2(b.totalSftSold),
      totalPurchases: round2(b.totalPurchases),
      totalExpenses: round2(b.totalExpenses),
      netProfit: round2(b.netProfit),
      cashIn: round2(b.cashIn),
      cashOut: round2(b.cashOut),
    })));
  } catch (err) {
    console.error('[reports.accounting-summary]', err);
    res.status(500).json({ error: 'Failed to load accounting summary' });
  }
});

// ─── 10. Inventory Aging Report (FIFO) ────────────────────────────────────
router.get('/inventory-aging', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [products, stocks, purItems, saleItems] = await Promise.all([
      db('products')
        .where({ dealer_id: dealerId, active: true })
        .orderBy('sku')
        .select('id', 'sku', 'name', 'brand', 'category', 'unit_type', 'per_box_sft', 'reorder_level'),
      db('stock')
        .where({ dealer_id: dealerId })
        .select('product_id', 'box_qty', 'sft_qty', 'piece_qty', 'average_cost_per_unit'),
      db('purchase_items as pi')
        .leftJoin('purchases as p', 'p.id', 'pi.purchase_id')
        .where('pi.dealer_id', dealerId)
        .select('pi.product_id', 'pi.quantity', 'pi.purchase_rate', 'pi.landed_cost', 'p.purchase_date'),
      db('sale_items as si')
        .leftJoin('sales as s', 's.id', 'si.sale_id')
        .where('si.dealer_id', dealerId)
        .select('si.product_id', 'si.quantity', 's.sale_date'),
    ]);

    const stockMap = new Map(stocks.map((s: any) => [s.product_id, s]));

    const purchaseBatchMap: Record<string, { qty: number; cost: number; date: string }[]> = {};
    for (const item of purItems as any[]) {
      const pid = item.product_id;
      const dateStr = item.purchase_date ? String(item.purchase_date).substring(0, 10) : '1970-01-01';
      const cost = Number(item.landed_cost) > 0 ? Number(item.landed_cost) : Number(item.purchase_rate);
      if (!purchaseBatchMap[pid]) purchaseBatchMap[pid] = [];
      purchaseBatchMap[pid].push({ qty: Number(item.quantity), cost, date: dateStr });
    }
    for (const pid of Object.keys(purchaseBatchMap)) {
      purchaseBatchMap[pid].sort((a, b) => a.date.localeCompare(b.date));
    }

    const saleMap: Record<string, { totalSold: number; lastSaleDate: string | null }> = {};
    for (const item of saleItems as any[]) {
      const pid = item.product_id;
      const dateStr = item.sale_date ? String(item.sale_date).substring(0, 10) : null;
      if (!saleMap[pid]) saleMap[pid] = { totalSold: 0, lastSaleDate: null };
      saleMap[pid].totalSold += Number(item.quantity);
      if (dateStr && (!saleMap[pid].lastSaleDate || dateStr > saleMap[pid].lastSaleDate!)) {
        saleMap[pid].lastSaleDate = dateStr;
      }
    }

    const rows: any[] = [];
    let totalFifoValue = 0;

    for (const product of products as any[]) {
      const stock: any = stockMap.get(product.id);
      if (!stock) continue;
      const boxQty = Number(stock.box_qty);
      const sftQty = Number(stock.sft_qty);
      const pieceQty = Number(stock.piece_qty);
      const avgCostPerUnit = Number(stock.average_cost_per_unit);
      const currentBaseQty = product.unit_type === 'box_sft' ? boxQty : pieceQty;
      if (currentBaseQty <= 0) continue;

      const batches = purchaseBatchMap[product.id] ?? [];
      let soldQty = saleMap[product.id]?.totalSold ?? 0;
      const remaining: { qty: number; cost: number }[] = [];
      for (const b of batches) {
        if (soldQty <= 0) remaining.push({ qty: b.qty, cost: b.cost });
        else if (soldQty >= b.qty) soldQty -= b.qty;
        else { remaining.push({ qty: b.qty - soldQty, cost: b.cost }); soldQty = 0; }
      }

      let fifoValue = 0;
      let qtyToValue = currentBaseQty;
      for (const b of remaining) {
        if (qtyToValue <= 0) break;
        const take = Math.min(b.qty, qtyToValue);
        fifoValue += take * b.cost;
        qtyToValue -= take;
      }
      if (qtyToValue > 0) fifoValue += qtyToValue * avgCostPerUnit;

      const lastSaleDate = saleMap[product.id]?.lastSaleDate ?? null;
      let daysSinceLastSale: number | null = null;
      if (lastSaleDate) {
        const d = new Date(lastSaleDate);
        daysSinceLastSale = Math.floor((today.getTime() - d.getTime()) / 86400000);
      }
      let agingCategory: string;
      if (daysSinceLastSale === null) agingCategory = 'unsold';
      else if (daysSinceLastSale <= 30) agingCategory = 'fast';
      else if (daysSinceLastSale <= 90) agingCategory = 'normal';
      else agingCategory = 'slow';

      totalFifoValue += fifoValue;
      rows.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        category: product.category,
        unitType: product.unit_type,
        boxQty, sftQty, pieceQty, avgCostPerUnit,
        fifoStockValue: round2(fifoValue),
        lastSaleDate, daysSinceLastSale, agingCategory,
      });
    }

    const order: Record<string, number> = { unsold: 0, slow: 1, normal: 2, fast: 3 };
    rows.sort((a, b) => {
      const d = order[a.agingCategory] - order[b.agingCategory];
      return d !== 0 ? d : b.fifoStockValue - a.fifoStockValue;
    });

    res.json({ rows, totalFifoValue: round2(totalFifoValue) });
  } catch (err) {
    console.error('[reports.inventory-aging]', err);
    res.status(500).json({ error: 'Failed to load inventory aging report' });
  }
});

// ─── 11. Low Stock Report ─────────────────────────────────────────────────
router.get('/low-stock', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  // Allow salesman to see low-stock (they need to know what's out)
  try {
    const products = await db('products')
      .where({ dealer_id: dealerId, active: true })
      .orderBy('sku')
      .select('id', 'sku', 'name', 'brand', 'category', 'unit_type', 'reorder_level');
    if (!products.length) {
      res.json([]);
      return;
    }
    const ids = products.map((p: any) => p.id);
    const stocks = await db('stock')
      .where({ dealer_id: dealerId })
      .whereIn('product_id', ids)
      .select('product_id', 'box_qty', 'piece_qty', 'sft_qty');
    const sm = new Map(stocks.map((s: any) => [s.product_id, s]));

    const rows: any[] = [];
    for (const p of products as any[]) {
      const s: any = sm.get(p.id);
      const boxQty = Number(s?.box_qty ?? 0);
      const pieceQty = Number(s?.piece_qty ?? 0);
      const currentStock = boxQty + pieceQty;
      const reorderLevel = Number(p.reorder_level ?? 0);
      if (currentStock <= reorderLevel) {
        rows.push({
          productId: p.id, sku: p.sku, name: p.name, brand: p.brand,
          category: p.category, unitType: p.unit_type,
          currentStock, reorderLevel,
          suggestedReorderQty: Math.max(0, reorderLevel * 2 - currentStock),
        });
      }
    }
    rows.sort((a, b) => (a.currentStock - a.reorderLevel) - (b.currentStock - b.reorderLevel));
    res.json(rows);
  } catch (err) {
    console.error('[reports.low-stock]', err);
    res.status(500).json({ error: 'Failed to load low stock report' });
  }
});

// ─── Free vs Reserved Stock (Phase 3U-4) ──────────────────────────────────
router.get('/free-vs-reserved', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;
  try {
    const [products, stock] = await Promise.all([
      db('products')
        .where({ dealer_id: dealerId, active: true })
        .select('id', 'name', 'sku', 'unit_type')
        .orderBy('sku'),
      db('stock')
        .where({ dealer_id: dealerId })
        .select('product_id', 'box_qty', 'piece_qty', 'reserved_box_qty', 'reserved_piece_qty'),
    ]);
    const stockMap = new Map<string, any>((stock as any[]).map((s) => [s.product_id, s]));
    const rows = (products as any[])
      .map((p) => {
        const s = stockMap.get(p.id);
        const total =
          p.unit_type === 'box_sft' ? Number(s?.box_qty ?? 0) : Number(s?.piece_qty ?? 0);
        const reserved =
          p.unit_type === 'box_sft'
            ? Number(s?.reserved_box_qty ?? 0)
            : Number(s?.reserved_piece_qty ?? 0);
        return {
          name: p.name,
          sku: p.sku,
          unitType: p.unit_type,
          total,
          reserved,
          free: total - reserved,
        };
      })
      .filter((r) => r.total > 0 || r.reserved > 0);
    res.json({ rows });
  } catch (err: any) {
    console.error('[reports.free-vs-reserved]', err.message);
    res.status(500).json({ error: 'Failed to load free vs reserved report' });
  }
});

// ─── Sales by Salesman (Phase 3U-4) ───────────────────────────────────────
router.get('/sales-by-salesman', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;
  const year = parseInt((req.query.year as string) || `${new Date().getFullYear()}`, 10);
  const month = parseInt((req.query.month as string) || `${new Date().getMonth() + 1}`, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    res.status(400).json({ error: 'Invalid year/month' });
    return;
  }
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
  try {
    const sales = await db('sales')
      .where({ dealer_id: dealerId })
      .andWhere('sale_date', '>=', startDate)
      .andWhere('sale_date', '<=', endDate)
      .select('id', 'total_amount', 'paid_amount', 'due_amount', 'discount', 'created_by');

    const userIds = Array.from(
      new Set((sales as any[]).map((s) => s.created_by).filter(Boolean)),
    );
    const profileMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const profiles = await db('profiles').whereIn('id', userIds).select('id', 'name');
      for (const p of profiles as any[]) profileMap[p.id] = p.name;
    }

    const map: Record<
      string,
      { name: string; count: number; total: number; paid: number; due: number; discount: number }
    > = {};
    for (const s of sales as any[]) {
      const uid = s.created_by ?? 'unknown';
      if (!map[uid]) {
        map[uid] = {
          name: profileMap[uid] ?? 'Unknown',
          count: 0,
          total: 0,
          paid: 0,
          due: 0,
          discount: 0,
        };
      }
      map[uid].count += 1;
      map[uid].total += Number(s.total_amount);
      map[uid].paid += Number(s.paid_amount);
      map[uid].due += Number(s.due_amount);
      map[uid].discount += Number(s.discount);
    }

    const rows = Object.values(map).sort((a, b) => b.total - a.total);
    res.json({ rows });
  } catch (err: any) {
    console.error('[reports.sales-by-salesman]', err.message);
    res.status(500).json({ error: 'Failed to load sales-by-salesman report' });
  }
});

// ─── Supplier Outstanding (Phase 3U-4) ────────────────────────────────────
router.get('/supplier-outstanding', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;
  try {
    const [ledger, suppliers] = await Promise.all([
      db('supplier_ledger')
        .where({ dealer_id: dealerId })
        .select('supplier_id', 'amount', 'type'),
      db('suppliers')
        .where({ dealer_id: dealerId })
        .select('id', 'name', 'phone', 'status'),
    ]);
    const suppMap = new Map<string, any>((suppliers as any[]).map((s) => [s.id, s]));
    const balances: Record<string, { debit: number; credit: number; paymentCount: number }> = {};
    for (const e of ledger as any[]) {
      const sid = e.supplier_id;
      if (!balances[sid]) balances[sid] = { debit: 0, credit: 0, paymentCount: 0 };
      const amt = Number(e.amount);
      if (amt >= 0) balances[sid].debit += amt;
      else balances[sid].credit += Math.abs(amt);
      if (e.type === 'payment') balances[sid].paymentCount += 1;
    }
    const rows = Object.entries(balances)
      .map(([sid, b]) => {
        const s = suppMap.get(sid);
        return {
          supplierId: sid,
          name: s?.name ?? '—',
          phone: s?.phone ?? '—',
          totalPurchase: round2(b.debit),
          totalPaid: round2(b.credit),
          outstanding: round2(b.debit - b.credit),
          payments: b.paymentCount,
        };
      })
      .filter((r) => r.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding);
    res.json({ rows });
  } catch (err: any) {
    console.error('[reports.supplier-outstanding]', err.message);
    res.status(500).json({ error: 'Failed to load supplier outstanding report' });
  }
});

// ─── Sale overdue check for a single customer (Phase 3U-4) ────────────────
router.get('/sale-overdue-check', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const customerId = (req.query.customerId as string | undefined) || '';
  if (!customerId) {
    res.status(400).json({ error: 'customerId is required' });
    return;
  }
  try {
    const [customer, ledger, oldestSale] = await Promise.all([
      db('customers')
        .where({ id: customerId, dealer_id: dealerId })
        .select('credit_limit', 'max_overdue_days')
        .first(),
      db('customer_ledger')
        .where({ customer_id: customerId, dealer_id: dealerId })
        .select('amount', 'type'),
      db('sales')
        .where({ customer_id: customerId, dealer_id: dealerId })
        .andWhere('due_amount', '>', 0)
        .orderBy('sale_date', 'asc')
        .select('sale_date')
        .first(),
    ]);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    let outstanding = 0;
    for (const row of ledger as any[]) {
      const amt = Number(row.amount);
      if (row.type === 'sale') outstanding += amt;
      else if (row.type === 'payment' || row.type === 'refund') outstanding -= amt;
      else if (row.type === 'adjustment') outstanding += amt;
    }
    const oldestDate = (oldestSale as any)?.sale_date ?? null;
    const daysOverdue = oldestDate
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(oldestDate).getTime()) / 86400000),
        )
      : 0;
    const maxOverdueDays = Number(customer.max_overdue_days ?? 0);
    const creditLimit = Number(customer.credit_limit ?? 0);
    res.json({
      outstanding: round2(outstanding),
      daysOverdue,
      maxOverdueDays,
      creditLimit,
      isOverdueViolated: maxOverdueDays > 0 && daysOverdue > maxOverdueDays,
      isCreditExceeded: creditLimit > 0 && outstanding > creditLimit,
    });
  } catch (err: any) {
    console.error('[reports.sale-overdue-check]', err.message);
    res.status(500).json({ error: 'Failed to load overdue check' });
  }
});

// ─── Reserved Stock report (full join) ────────────────────────────────────
router.get('/reservations-active', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  try {
    const rows = await db('stock_reservations as sr')
      .leftJoin('products as p', 'p.id', 'sr.product_id')
      .leftJoin('customers as c', 'c.id', 'sr.customer_id')
      .leftJoin('product_batches as pb', 'pb.id', 'sr.batch_id')
      .where({ 'sr.dealer_id': dealerId, 'sr.status': 'active' })
      .orderBy('sr.created_at', 'desc')
      .select(
        'sr.id',
        'sr.reserved_qty',
        'sr.fulfilled_qty',
        'sr.released_qty',
        'sr.status',
        'sr.expires_at',
        'sr.reason',
        'sr.created_at',
        'p.name as product_name',
        'p.sku as product_sku',
        'p.unit_type as product_unit_type',
        'p.default_sale_rate as product_default_sale_rate',
        'c.id as customer_id',
        'c.name as customer_name',
        'pb.batch_no',
        'pb.shade_code',
        'pb.caliber',
      );
    res.json({
      rows: (rows as any[]).map((r) => ({
        id: r.id,
        reserved_qty: r.reserved_qty,
        fulfilled_qty: r.fulfilled_qty,
        released_qty: r.released_qty,
        status: r.status,
        expires_at: r.expires_at,
        reason: r.reason,
        created_at: r.created_at,
        products: {
          name: r.product_name,
          sku: r.product_sku,
          unit_type: r.product_unit_type,
          default_sale_rate: r.product_default_sale_rate,
        },
        customers: r.customer_id ? { id: r.customer_id, name: r.customer_name } : null,
        product_batches: r.batch_no
          ? { batch_no: r.batch_no, shade_code: r.shade_code, caliber: r.caliber }
          : null,
      })),
    });
  } catch (err: any) {
    console.error('[reports.reservations-active]', err.message);
    res.status(500).json({ error: 'Failed to load reservations' });
  }
});

router.get('/reservations-expiring', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const days = Math.max(1, parseInt((req.query.days as string) || '7', 10));
  const cutoff = new Date(Date.now() + days * 86400000).toISOString();
  try {
    const rows = await db('stock_reservations as sr')
      .leftJoin('products as p', 'p.id', 'sr.product_id')
      .leftJoin('customers as c', 'c.id', 'sr.customer_id')
      .leftJoin('product_batches as pb', 'pb.id', 'sr.batch_id')
      .where({ 'sr.dealer_id': dealerId, 'sr.status': 'active' })
      .whereNotNull('sr.expires_at')
      .andWhere('sr.expires_at', '<=', cutoff)
      .orderBy('sr.expires_at', 'asc')
      .select(
        'sr.id',
        'sr.reserved_qty',
        'sr.fulfilled_qty',
        'sr.released_qty',
        'sr.expires_at',
        'sr.reason',
        'p.name as product_name',
        'p.sku as product_sku',
        'c.name as customer_name',
        'pb.batch_no',
        'pb.shade_code',
      );
    res.json({
      rows: (rows as any[]).map((r) => ({
        id: r.id,
        reserved_qty: r.reserved_qty,
        fulfilled_qty: r.fulfilled_qty,
        released_qty: r.released_qty,
        expires_at: r.expires_at,
        reason: r.reason,
        products: { name: r.product_name, sku: r.product_sku },
        customers: { name: r.customer_name },
        product_batches: r.batch_no
          ? { batch_no: r.batch_no, shade_code: r.shade_code }
          : null,
      })),
    });
  } catch (err: any) {
    console.error('[reports.reservations-expiring]', err.message);
    res.status(500).json({ error: 'Failed to load expiring reservations' });
  }
});

router.get('/reservations-by-customer', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  try {
    const rows = await db('stock_reservations as sr')
      .leftJoin('customers as c', 'c.id', 'sr.customer_id')
      .leftJoin('products as p', 'p.id', 'sr.product_id')
      .where({ 'sr.dealer_id': dealerId, 'sr.status': 'active' })
      .select(
        'sr.reserved_qty',
        'sr.fulfilled_qty',
        'sr.released_qty',
        'c.id as customer_id',
        'c.name as customer_name',
        'p.default_sale_rate as product_default_sale_rate',
      );
    const custMap: Record<
      string,
      { name: string; holds: number; totalQty: number; totalValue: number }
    > = {};
    for (const r of rows as any[]) {
      const cid = r.customer_id;
      if (!cid) continue;
      const remaining =
        Number(r.reserved_qty) - Number(r.fulfilled_qty) - Number(r.released_qty);
      const rate = Number(r.product_default_sale_rate ?? 0);
      if (!custMap[cid]) {
        custMap[cid] = { name: r.customer_name, holds: 0, totalQty: 0, totalValue: 0 };
      }
      custMap[cid].holds += 1;
      custMap[cid].totalQty += remaining;
      custMap[cid].totalValue += remaining * rate;
    }
    res.json({
      rows: Object.values(custMap).sort((a, b) => b.totalValue - a.totalValue),
    });
  } catch (err: any) {
    console.error('[reports.reservations-by-customer]', err.message);
    res.status(500).json({ error: 'Failed to load customer reservations' });
  }
});

router.get('/reservations-by-batch', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  try {
    const rows = await db('stock_reservations as sr')
      .leftJoin('products as p', 'p.id', 'sr.product_id')
      .leftJoin('customers as c', 'c.id', 'sr.customer_id')
      .leftJoin('product_batches as pb', 'pb.id', 'sr.batch_id')
      .where({ 'sr.dealer_id': dealerId, 'sr.status': 'active' })
      .whereNotNull('sr.batch_id')
      .orderBy('sr.created_at', 'desc')
      .select(
        'sr.reserved_qty',
        'sr.fulfilled_qty',
        'sr.released_qty',
        'p.name as product_name',
        'p.sku as product_sku',
        'p.unit_type as product_unit_type',
        'c.name as customer_name',
        'pb.id as batch_id',
        'pb.batch_no',
        'pb.shade_code',
        'pb.caliber',
        'pb.box_qty as batch_box_qty',
        'pb.piece_qty as batch_piece_qty',
        'pb.reserved_box_qty as batch_reserved_box_qty',
        'pb.reserved_piece_qty as batch_reserved_piece_qty',
      );
    res.json({
      rows: (rows as any[]).map((r) => ({
        reserved_qty: r.reserved_qty,
        fulfilled_qty: r.fulfilled_qty,
        released_qty: r.released_qty,
        products: {
          name: r.product_name,
          sku: r.product_sku,
          unit_type: r.product_unit_type,
        },
        customers: { name: r.customer_name },
        product_batches: {
          id: r.batch_id,
          batch_no: r.batch_no,
          shade_code: r.shade_code,
          caliber: r.caliber,
          box_qty: r.batch_box_qty,
          piece_qty: r.batch_piece_qty,
          reserved_box_qty: r.batch_reserved_box_qty,
          reserved_piece_qty: r.batch_reserved_piece_qty,
        },
      })),
    });
  } catch (err: any) {
    console.error('[reports.reservations-by-batch]', err.message);
    res.status(500).json({ error: 'Failed to load batch reservations' });
  }
});

// ─── Pending Deliveries (Phase 3U-5) ──────────────────────────────────────
router.get('/pending-deliveries', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  try {
    const rows = await db('challans as ch')
      .leftJoin('sales as s', 's.id', 'ch.sale_id')
      .leftJoin('customers as c', 'c.id', 's.customer_id')
      .where({ 'ch.dealer_id': dealerId })
      .andWhereNot('ch.delivery_status', 'delivered')
      .orderBy('ch.challan_date', 'asc')
      .select(
        'ch.id',
        'ch.challan_no',
        'ch.challan_date',
        'ch.delivery_status',
        'ch.transport_name',
        'ch.vehicle_no',
        'ch.driver_name',
        's.invoice_number as invoice_number',
        'c.name as customer_name',
      );
    const today = Date.now();
    res.json({
      rows: (rows as any[]).map((r) => {
        const days = Math.floor(
          (today - new Date(r.challan_date).getTime()) / 86_400_000,
        );
        return {
          challanNo: r.challan_no,
          challanDate: r.challan_date,
          invoiceNo: r.invoice_number ?? '—',
          customer: r.customer_name ?? '—',
          status: r.delivery_status,
          transport: r.transport_name ?? '—',
          vehicle: r.vehicle_no ?? '—',
          daysPending: days,
          isLate: days > 2,
        };
      }),
    });
  } catch (err: any) {
    console.error('[reports.pending-deliveries]', err.message);
    res.status(500).json({ error: 'Failed to load pending deliveries' });
  }
});

// ─── Delivery Status (Phase 3U-5) ─────────────────────────────────────────
router.get('/delivery-status', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const status = (req.query.status as string | undefined) || 'all';
  try {
    let q = db('challans as ch')
      .leftJoin('sales as s', 's.id', 'ch.sale_id')
      .leftJoin('customers as c', 'c.id', 's.customer_id')
      .where({ 'ch.dealer_id': dealerId })
      .orderBy('ch.challan_date', 'desc')
      .limit(100)
      .select(
        'ch.id',
        'ch.challan_no',
        'ch.challan_date',
        'ch.delivery_status',
        'ch.transport_name',
        'ch.vehicle_no',
        'ch.driver_name',
        's.invoice_number as invoice_number',
        'c.name as customer_name',
      );
    if (status !== 'all') q = q.andWhere('ch.delivery_status', status);
    const rows = await q;
    res.json({
      rows: (rows as any[]).map((r) => ({
        challanNo: r.challan_no,
        challanDate: r.challan_date,
        invoiceNo: r.invoice_number ?? '—',
        customer: r.customer_name ?? '—',
        status: r.delivery_status,
        transport: r.transport_name ?? '—',
        vehicle: r.vehicle_no ?? '—',
        driver: r.driver_name ?? '—',
      })),
    });
  } catch (err: any) {
    console.error('[reports.delivery-status]', err.message);
    res.status(500).json({ error: 'Failed to load delivery status' });
  }
});

// ─── Stock Movement (Phase 3U-5) ──────────────────────────────────────────
router.get('/stock-movement', async (req, res) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireFinancialRole(req, res)) return;
  const productId = (req.query.productId as string | undefined) || '';
  if (!productId) {
    res.status(400).json({ error: 'productId is required' });
    return;
  }
  try {
    const [purchaseItems, saleItems, returns] = await Promise.all([
      db('purchase_items as pi')
        .leftJoin('purchases as p', 'p.id', 'pi.purchase_id')
        .where({ 'pi.dealer_id': dealerId, 'pi.product_id': productId })
        .select(
          'pi.id',
          'pi.quantity',
          'pi.purchase_rate',
          'pi.total',
          'p.purchase_date',
          'p.invoice_number',
        ),
      db('sale_items as si')
        .leftJoin('sales as s', 's.id', 'si.sale_id')
        .where({ 'si.dealer_id': dealerId, 'si.product_id': productId })
        .select(
          'si.id',
          'si.quantity',
          'si.sale_rate',
          'si.total',
          's.sale_date',
          's.invoice_number',
        ),
      db('sales_returns as sr')
        .leftJoin('sales as s', 's.id', 'sr.sale_id')
        .where({ 'sr.dealer_id': dealerId, 'sr.product_id': productId })
        .select(
          'sr.id',
          'sr.qty',
          'sr.refund_amount',
          'sr.return_date',
          'sr.is_broken',
          's.invoice_number',
        ),
    ]);

    type MovementRow = {
      id: string;
      date: string;
      type: string;
      reference: string;
      qtyIn: number;
      qtyOut: number;
      rate: number;
      total: number;
    };
    const movements: MovementRow[] = [];
    for (const pi of purchaseItems as any[]) {
      movements.push({
        id: pi.id,
        date: pi.purchase_date ?? '',
        type: 'Purchase',
        reference: pi.invoice_number ?? '—',
        qtyIn: Number(pi.quantity),
        qtyOut: 0,
        rate: Number(pi.purchase_rate),
        total: Number(pi.total),
      });
    }
    for (const si of saleItems as any[]) {
      movements.push({
        id: si.id,
        date: si.sale_date ?? '',
        type: 'Sale',
        reference: si.invoice_number ?? '—',
        qtyIn: 0,
        qtyOut: Number(si.quantity),
        rate: Number(si.sale_rate),
        total: Number(si.total),
      });
    }
    for (const sr of returns as any[]) {
      movements.push({
        id: sr.id,
        date: sr.return_date,
        type: sr.is_broken ? 'Return (Broken)' : 'Return',
        reference: sr.invoice_number ?? '—',
        qtyIn: sr.is_broken ? 0 : Number(sr.qty),
        qtyOut: sr.is_broken ? Number(sr.qty) : 0,
        rate: 0,
        total: Number(sr.refund_amount),
      });
    }
    movements.sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    const withBalance = movements.map((m) => {
      balance += m.qtyIn - m.qtyOut;
      return { ...m, balance };
    });
    res.json({ rows: withBalance });
  } catch (err: any) {
    console.error('[reports.stock-movement]', err.message);
    res.status(500).json({ error: 'Failed to load stock movement' });
  }
});

export default router;
