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

export default router;
