import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 25;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ─── Stock Report (SKU-wise) ──────────────────────────────
export interface StockRow {
  productId: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string;
  unitType: string;
  boxQty: number;
  sftQty: number;
  pieceQty: number;
  avgCost: number;
  stockValue: number;
  reorderLevel: number;
  isLow: boolean;
}

export async function fetchStockReport(
  dealerId: string,
  page: number,
  search?: string
): Promise<{ rows: StockRow[]; total: number }> {
  let pQuery = supabase
    .from("products")
    .select("id, sku, name, brand, category, unit_type, reorder_level", { count: "exact" })
    .eq("dealer_id", dealerId)
    .eq("active", true)
    .order("sku");

  if (search?.trim()) {
    pQuery = pQuery.or(`sku.ilike.%${search.trim()}%,name.ilike.%${search.trim()}%,brand.ilike.%${search.trim()}%`);
  }

  pQuery = pQuery.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data: products, count, error } = await pQuery;
  if (error) throw new Error(error.message);

  const ids = (products ?? []).map((p) => p.id);
  if (ids.length === 0) return { rows: [], total: 0 };

  const { data: stocks } = await supabase
    .from("stock")
    .select("product_id, box_qty, sft_qty, piece_qty, average_cost_per_unit")
    .eq("dealer_id", dealerId)
    .in("product_id", ids);

  const stockMap = new Map((stocks ?? []).map((s) => [s.product_id, s]));

  const rows: StockRow[] = (products ?? []).map((p) => {
    const s = stockMap.get(p.id);
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
      reorderLevel: p.reorder_level,
      isLow: totalQty <= p.reorder_level,
    };
  });

  return { rows, total: count ?? 0 };
}

// ─── Products Report (with Purchase/Sale/Profit/Stock) ────
export interface ProductReportRow {
  productId: string;
  sku: string;
  name: string;
  purchasedQty: number;
  purchasedAmount: number;
  soldQty: number;
  soldAmount: number;
  profitOrLoss: number;
  stockQty: number;
  stockAmount: number;
}

export async function fetchProductsReport(
  dealerId: string,
  page: number,
  search?: string
): Promise<{ rows: ProductReportRow[]; total: number }> {
  let pQuery = supabase
    .from("products")
    .select("id, sku, name, brand, category, unit_type, per_box_sft", { count: "exact" })
    .eq("dealer_id", dealerId)
    .eq("active", true)
    .order("sku");

  if (search?.trim()) {
    pQuery = pQuery.or(`sku.ilike.%${search.trim()}%,name.ilike.%${search.trim()}%,brand.ilike.%${search.trim()}%`);
  }

  pQuery = pQuery.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data: products, count, error } = await pQuery;
  if (error) throw new Error(error.message);

  const ids = (products ?? []).map((p) => p.id);
  if (ids.length === 0) return { rows: [], total: 0 };

  // Fetch purchase items, sale items, and stock in parallel
  const [purchaseItemsRes, saleItemsRes, stocksRes] = await Promise.all([
    supabase
      .from("purchase_items")
      .select("product_id, quantity, total")
      .eq("dealer_id", dealerId)
      .in("product_id", ids),
    supabase
      .from("sale_items")
      .select("product_id, quantity, total")
      .eq("dealer_id", dealerId)
      .in("product_id", ids),
    supabase
      .from("stock")
      .select("product_id, box_qty, piece_qty, average_cost_per_unit")
      .eq("dealer_id", dealerId)
      .in("product_id", ids),
  ]);

  // Aggregate purchases by product
  const purchaseMap: Record<string, { qty: number; amount: number }> = {};
  for (const pi of purchaseItemsRes.data ?? []) {
    if (!purchaseMap[pi.product_id]) purchaseMap[pi.product_id] = { qty: 0, amount: 0 };
    purchaseMap[pi.product_id].qty += Number(pi.quantity);
    purchaseMap[pi.product_id].amount += Number(pi.total);
  }

  // Aggregate sales by product
  const saleMap: Record<string, { qty: number; amount: number }> = {};
  for (const si of saleItemsRes.data ?? []) {
    if (!saleMap[si.product_id]) saleMap[si.product_id] = { qty: 0, amount: 0 };
    saleMap[si.product_id].qty += Number(si.quantity);
    saleMap[si.product_id].amount += Number(si.total);
  }

  const stockMap = new Map((stocksRes.data ?? []).map((s) => [s.product_id, s]));

  const rows: ProductReportRow[] = (products ?? []).map((p) => {
    const purchased = purchaseMap[p.id] ?? { qty: 0, amount: 0 };
    const sold = saleMap[p.id] ?? { qty: 0, amount: 0 };
    const s = stockMap.get(p.id);
    const stockQty = Number(s?.box_qty ?? 0) + Number(s?.piece_qty ?? 0);
    const avgCost = Number(s?.average_cost_per_unit ?? 0);

    // Profit = Sales revenue - Cost of goods sold (using avg cost * sold qty)
    const cogs = sold.qty * avgCost;
    const profitOrLoss = round2(sold.amount - cogs);

    return {
      productId: p.id,
      sku: p.sku,
      name: `${p.name}${p.category === 'tiles' && p.per_box_sft ? ` (Box: ${p.per_box_sft}sft)` : ''}`,
      purchasedQty: purchased.qty,
      purchasedAmount: round2(purchased.amount),
      soldQty: sold.qty,
      soldAmount: round2(sold.amount),
      profitOrLoss,
      stockQty,
      stockAmount: round2(stockQty * avgCost),
    };
  });

  return { rows, total: count ?? 0 };
}

// ─── Brand-wise Stock ─────────────────────────────────────
export interface BrandStockRow {
  brand: string;
  totalBox: number;
  totalSft: number;
  totalPiece: number;
  totalValue: number;
  productCount: number;
}

export async function fetchBrandStockReport(dealerId: string): Promise<BrandStockRow[]> {
  const { data: products } = await supabase
    .from("products")
    .select("id, brand, unit_type")
    .eq("dealer_id", dealerId)
    .eq("active", true);

  const ids = (products ?? []).map((p) => p.id);
  if (ids.length === 0) return [];

  const { data: stocks } = await supabase
    .from("stock")
    .select("product_id, box_qty, sft_qty, piece_qty, average_cost_per_unit")
    .eq("dealer_id", dealerId)
    .in("product_id", ids);

  const stockMap = new Map((stocks ?? []).map((s) => [s.product_id, s]));
  const brandMap: Record<string, BrandStockRow> = {};

  for (const p of products ?? []) {
    const brand = p.brand || "No Brand";
    if (!brandMap[brand]) {
      brandMap[brand] = { brand, totalBox: 0, totalSft: 0, totalPiece: 0, totalValue: 0, productCount: 0 };
    }
    const s = stockMap.get(p.id);
    const boxQty = Number(s?.box_qty ?? 0);
    const sftQty = Number(s?.sft_qty ?? 0);
    const pieceQty = Number(s?.piece_qty ?? 0);
    const avgCost = Number(s?.average_cost_per_unit ?? 0);
    brandMap[brand].totalBox += boxQty;
    brandMap[brand].totalSft += sftQty;
    brandMap[brand].totalPiece += pieceQty;
    brandMap[brand].totalValue += (boxQty + pieceQty) * avgCost;
    brandMap[brand].productCount += 1;
  }

  return Object.values(brandMap)
    .map((b) => ({ ...b, totalValue: round2(b.totalValue), totalSft: round2(b.totalSft) }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

// ─── Sales Report (Daily/Monthly) ─────────────────────────
export interface SalesReportRow {
  date: string;
  count: number;
  totalAmount: number;
  totalCollection: number;
  totalProfit: number;
  totalDue: number;
  totalSft: number;
}

export async function fetchSalesReport(
  dealerId: string,
  mode: "daily" | "monthly",
  year: number,
  month?: number
): Promise<SalesReportRow[]> {
  let query = supabase
    .from("sales")
    .select("sale_date, total_amount, paid_amount, profit, due_amount, total_sft")
    .eq("dealer_id", dealerId)
    .order("sale_date");

  if (mode === "daily" && month) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
    query = query.gte("sale_date", start).lte("sale_date", end);
  } else {
    query = query.gte("sale_date", `${year}-01-01`).lte("sale_date", `${year}-12-31`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const buckets: Record<string, SalesReportRow> = {};
  for (const row of data ?? []) {
    const key = mode === "daily" ? row.sale_date : row.sale_date.substring(0, 7);
    if (!buckets[key]) {
      buckets[key] = { date: key, count: 0, totalAmount: 0, totalCollection: 0, totalProfit: 0, totalDue: 0, totalSft: 0 };
    }
    buckets[key].count += 1;
    buckets[key].totalAmount += Number(row.total_amount);
    buckets[key].totalCollection += Number(row.paid_amount);
    buckets[key].totalProfit += Number(row.profit);
    buckets[key].totalDue += Number(row.due_amount);
    buckets[key].totalSft += Number(row.total_sft);
  }

  return Object.values(buckets)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => ({
      ...b,
      totalAmount: round2(b.totalAmount),
      totalCollection: round2(b.totalCollection),
      totalProfit: round2(b.totalProfit),
      totalDue: round2(b.totalDue),
      totalSft: round2(b.totalSft),
    }));
}

// ─── Retailer-wise Sales (SFT-based) ─────────────────────
export interface RetailerSalesRow {
  customerId: string;
  customerName: string;
  customerType: string;
  totalSft: number;
  totalAmount: number;
  totalDue: number;
  saleCount: number;
}

export async function fetchRetailerSalesReport(
  dealerId: string,
  year: number,
  customerType?: "retailer" | "customer" | "project"
): Promise<RetailerSalesRow[]> {
  let query = supabase
    .from("sales")
    .select("customer_id, total_sft, total_amount, due_amount, customers(name, type)")
    .eq("dealer_id", dealerId)
    .gte("sale_date", `${year}-01-01`)
    .lte("sale_date", `${year}-12-31`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const map: Record<string, RetailerSalesRow> = {};
  for (const row of data ?? []) {
    const cust = (row as any).customers;
    const type = cust?.type ?? "customer";

    // Filter by customer type if specified
    if (customerType && type !== customerType) continue;

    const cid = row.customer_id;
    if (!map[cid]) {
      map[cid] = {
        customerId: cid,
        customerName: cust?.name ?? "—",
        customerType: type,
        totalSft: 0,
        totalAmount: 0,
        totalDue: 0,
        saleCount: 0,
      };
    }
    map[cid].totalSft += Number(row.total_sft);
    map[cid].totalAmount += Number(row.total_amount);
    map[cid].totalDue += Number(row.due_amount);
    map[cid].saleCount += 1;
  }

  return Object.values(map)
    .map((r) => ({ ...r, totalSft: round2(r.totalSft), totalAmount: round2(r.totalAmount), totalDue: round2(r.totalDue) }))
    .sort((a, b) => b.totalSft - a.totalSft);
}

// ─── Product History (Purchase + Sale + Return) ───────────
export interface ProductHistoryRow {
  id: string;
  date: string;
  type: "purchase" | "sale" | "return";
  quantity: number;
  rate: number;
  total: number;
  reference: string;
}

export async function fetchProductHistory(
  dealerId: string,
  productId: string,
  page: number
): Promise<{ rows: ProductHistoryRow[]; total: number }> {
  const [purchaseRes, saleRes, returnRes] = await Promise.all([
    supabase
      .from("purchase_items")
      .select("id, quantity, purchase_rate, total, purchases(purchase_date, invoice_number)")
      .eq("dealer_id", dealerId)
      .eq("product_id", productId),
    supabase
      .from("sale_items")
      .select("id, quantity, sale_rate, total, sales(sale_date, invoice_number)")
      .eq("dealer_id", dealerId)
      .eq("product_id", productId),
    supabase
      .from("sales_returns")
      .select("id, qty, refund_amount, return_date, is_broken, sales(invoice_number)")
      .eq("dealer_id", dealerId)
      .eq("product_id", productId),
  ]);

  const rows: ProductHistoryRow[] = [];

  for (const pi of purchaseRes.data ?? []) {
    const p = (pi as any).purchases;
    rows.push({
      id: pi.id,
      date: p?.purchase_date ?? "",
      type: "purchase",
      quantity: Number(pi.quantity),
      rate: Number(pi.purchase_rate),
      total: Number(pi.total),
      reference: p?.invoice_number ?? "—",
    });
  }

  for (const si of saleRes.data ?? []) {
    const s = (si as any).sales;
    rows.push({
      id: si.id,
      date: s?.sale_date ?? "",
      type: "sale",
      quantity: Number(si.quantity),
      rate: Number(si.sale_rate),
      total: Number(si.total),
      reference: s?.invoice_number ?? "—",
    });
  }

  for (const sr of returnRes.data ?? []) {
    const s = (sr as any).sales;
    rows.push({
      id: sr.id,
      date: sr.return_date,
      type: "return",
      quantity: Number(sr.qty),
      rate: 0,
      total: Number(sr.refund_amount),
      reference: `${s?.invoice_number ?? "—"}${sr.is_broken ? " (broken)" : ""}`,
    });
  }

  rows.sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.length;
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { rows: paged, total };
}

// ─── Due Report: Customer Due List ────────────────────────
export interface CustomerDueRow {
  customerId: string;
  customerName: string;
  customerType: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export async function fetchCustomerDueReport(
  dealerId: string,
  page: number
): Promise<{ rows: CustomerDueRow[]; total: number }> {
  // Fetch all customer ledger entries
  const { data: ledgerData, error: lErr } = await supabase
    .from("customer_ledger")
    .select("customer_id, amount")
    .eq("dealer_id", dealerId);
  if (lErr) throw new Error(lErr.message);

  // Fetch customers for names
  const { data: customers, error: cErr } = await supabase
    .from("customers")
    .select("id, name, type")
    .eq("dealer_id", dealerId);
  if (cErr) throw new Error(cErr.message);

  const custMap = new Map((customers ?? []).map((c) => [c.id, c]));

  // Aggregate by customer
  const balances: Record<string, { debit: number; credit: number }> = {};
  for (const entry of ledgerData ?? []) {
    const cid = entry.customer_id;
    if (!balances[cid]) balances[cid] = { debit: 0, credit: 0 };
    const amt = Number(entry.amount);
    if (amt >= 0) balances[cid].debit += amt;
    else balances[cid].credit += Math.abs(amt);
  }

  const allRows: CustomerDueRow[] = Object.entries(balances)
    .map(([cid, b]) => {
      const cust = custMap.get(cid);
      return {
        customerId: cid,
        customerName: cust?.name ?? "—",
        customerType: cust?.type ?? "customer",
        totalDebit: round2(b.debit),
        totalCredit: round2(b.credit),
        balance: round2(b.debit - b.credit),
      };
    })
    .filter((r) => r.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const total = allRows.length;
  const paged = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { rows: paged, total };
}

// ─── Due Report: Supplier Payable List ────────────────────
export interface SupplierPayableRow {
  supplierId: string;
  supplierName: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export async function fetchSupplierPayableReport(
  dealerId: string,
  page: number
): Promise<{ rows: SupplierPayableRow[]; total: number }> {
  const { data: ledgerData, error: lErr } = await supabase
    .from("supplier_ledger")
    .select("supplier_id, amount")
    .eq("dealer_id", dealerId);
  if (lErr) throw new Error(lErr.message);

  const { data: suppliers, error: sErr } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("dealer_id", dealerId);
  if (sErr) throw new Error(sErr.message);

  const suppMap = new Map((suppliers ?? []).map((s) => [s.id, s]));

  const balances: Record<string, { debit: number; credit: number }> = {};
  for (const entry of ledgerData ?? []) {
    const sid = entry.supplier_id;
    if (!balances[sid]) balances[sid] = { debit: 0, credit: 0 };
    const amt = Number(entry.amount);
    if (amt >= 0) balances[sid].debit += amt;
    else balances[sid].credit += Math.abs(amt);
  }

  const allRows: SupplierPayableRow[] = Object.entries(balances)
    .map(([sid, b]) => {
      const supp = suppMap.get(sid);
      return {
        supplierId: sid,
        supplierName: supp?.name ?? "—",
        totalDebit: round2(b.debit),
        totalCredit: round2(b.credit),
        balance: round2(b.credit - b.debit), // we owe them
      };
    })
    .filter((r) => r.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const total = allRows.length;
  const paged = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { rows: paged, total };
}

// ─── Monthly Accounting Summary ───────────────────────────
export interface AccountingSummaryRow {
  month: string;
  totalSales: number;
  totalCollection: number;
  totalDue: number;
  totalSftSold: number;
  totalPurchases: number;
  totalExpenses: number;
  netProfit: number;
  cashIn: number;
  cashOut: number;
}

export async function fetchAccountingSummary(
  dealerId: string,
  year: number
): Promise<AccountingSummaryRow[]> {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [salesRes, purchasesRes, expensesRes, cashRes] = await Promise.all([
    supabase
      .from("sales")
      .select("sale_date, total_amount, paid_amount, profit, due_amount, total_sft")
      .eq("dealer_id", dealerId)
      .gte("sale_date", yearStart).lte("sale_date", yearEnd),
    supabase
      .from("purchases")
      .select("purchase_date, total_amount")
      .eq("dealer_id", dealerId)
      .gte("purchase_date", yearStart).lte("purchase_date", yearEnd),
    supabase
      .from("expenses")
      .select("expense_date, amount")
      .eq("dealer_id", dealerId)
      .gte("expense_date", yearStart).lte("expense_date", yearEnd),
    supabase
      .from("cash_ledger")
      .select("entry_date, amount")
      .eq("dealer_id", dealerId)
      .gte("entry_date", yearStart).lte("entry_date", yearEnd),
  ]);

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const buckets = MONTHS.map((m) => ({
    month: m,
    totalSales: 0,
    totalCollection: 0,
    totalDue: 0,
    totalSftSold: 0,
    totalPurchases: 0,
    totalExpenses: 0,
    netProfit: 0,
    cashIn: 0,
    cashOut: 0,
  }));

  for (const r of salesRes.data ?? []) {
    const m = new Date(r.sale_date).getMonth();
    buckets[m].totalSales += Number(r.total_amount);
    buckets[m].totalCollection += Number(r.paid_amount);
    buckets[m].totalDue += Number(r.due_amount);
    buckets[m].totalSftSold += Number(r.total_sft);
    buckets[m].netProfit += Number(r.profit);
  }
  for (const r of purchasesRes.data ?? []) {
    const m = new Date(r.purchase_date).getMonth();
    buckets[m].totalPurchases += Number(r.total_amount);
  }
  for (const r of expensesRes.data ?? []) {
    const m = new Date(r.expense_date).getMonth();
    buckets[m].totalExpenses += Number(r.amount);
  }
  for (const r of cashRes.data ?? []) {
    const m = new Date(r.entry_date).getMonth();
    const amt = Number(r.amount);
    if (amt >= 0) buckets[m].cashIn += amt;
    else buckets[m].cashOut += Math.abs(amt);
  }

  return buckets.map((b) => ({
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
  }));
}

// ─── Inventory Valuation + Aging Report (FIFO) ───────────
export interface InventoryAgingRow {
  productId: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string;
  unitType: string;
  boxQty: number;
  sftQty: number;
  pieceQty: number;
  avgCostPerUnit: number;
  fifoStockValue: number;
  lastSaleDate: string | null;
  daysSinceLastSale: number | null;
  agingCategory: "fast" | "normal" | "slow" | "unsold";
}

export async function fetchInventoryAgingReport(dealerId: string): Promise<{
  rows: InventoryAgingRow[];
  totalFifoValue: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parallel fetch: products, stock, all purchase batches, all sale quantities
  const [productsRes, stockRes, purchaseItemsRes, saleItemsRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, sku, name, brand, category, unit_type, per_box_sft, reorder_level")
      .eq("dealer_id", dealerId)
      .eq("active", true)
      .order("sku"),

    supabase
      .from("stock")
      .select("product_id, box_qty, sft_qty, piece_qty, average_cost_per_unit")
      .eq("dealer_id", dealerId),

    supabase
      .from("purchase_items")
      .select("product_id, quantity, purchase_rate, landed_cost, purchases(purchase_date)")
      .eq("dealer_id", dealerId),

    supabase
      .from("sale_items")
      .select("product_id, quantity, sales(sale_date)")
      .eq("dealer_id", dealerId),
  ]);

  if (productsRes.error) throw new Error(productsRes.error.message);

  const stockMap = new Map((stockRes.data ?? []).map((s) => [s.product_id, s]));

  // Build per-product purchase batches sorted by purchase_date ASC (oldest first)
  const purchaseBatchMap: Record<string, { qty: number; cost: number; date: string }[]> = {};
  for (const item of purchaseItemsRes.data ?? []) {
    const pid = item.product_id;
    const date = (item as any).purchases?.purchase_date ?? "1970-01-01";
    // Prefer landed_cost (fully loaded); fall back to purchase_rate
    const cost = Number(item.landed_cost) > 0 ? Number(item.landed_cost) : Number(item.purchase_rate);
    if (!purchaseBatchMap[pid]) purchaseBatchMap[pid] = [];
    purchaseBatchMap[pid].push({ qty: Number(item.quantity), cost, date });
  }
  for (const pid of Object.keys(purchaseBatchMap)) {
    purchaseBatchMap[pid].sort((a, b) => a.date.localeCompare(b.date));
  }

  // Build per-product: total sold quantity + latest sale date
  const saleMap: Record<string, { totalSold: number; lastSaleDate: string | null }> = {};
  for (const item of saleItemsRes.data ?? []) {
    const pid = item.product_id;
    const date = (item as any).sales?.sale_date ?? null;
    if (!saleMap[pid]) saleMap[pid] = { totalSold: 0, lastSaleDate: null };
    saleMap[pid].totalSold += Number(item.quantity);
    if (date && (!saleMap[pid].lastSaleDate || date > saleMap[pid].lastSaleDate!)) {
      saleMap[pid].lastSaleDate = date;
    }
  }

  const rows: InventoryAgingRow[] = [];
  let totalFifoValue = 0;

  for (const product of productsRes.data ?? []) {
    const stock = stockMap.get(product.id);
    if (!stock) continue;

    const boxQty = Number(stock.box_qty);
    const sftQty = Number(stock.sft_qty);
    const pieceQty = Number(stock.piece_qty);
    const avgCostPerUnit = Number(stock.average_cost_per_unit);

    // Base quantity (boxes for box_sft, pieces for piece)
    const currentBaseQty = product.unit_type === "box_sft" ? boxQty : pieceQty;
    if (currentBaseQty <= 0) continue;

    // ── FIFO algorithm ──────────────────────────────────────
    // FIFO: oldest purchases are consumed by sales first.
    // Remaining stock = newest purchase batches.
    const batches = purchaseBatchMap[product.id] ?? [];
    let soldQty = saleMap[product.id]?.totalSold ?? 0;

    // Walk through batches oldest→newest, deduct sold qty
    const remainingBatches: { qty: number; cost: number }[] = [];
    for (const batch of batches) {
      if (soldQty <= 0) {
        remainingBatches.push({ qty: batch.qty, cost: batch.cost });
      } else if (soldQty >= batch.qty) {
        soldQty -= batch.qty; // entire batch consumed
      } else {
        remainingBatches.push({ qty: batch.qty - soldQty, cost: batch.cost });
        soldQty = 0;
      }
    }

    // Value remaining stock from remaining FIFO layers (oldest → newest)
    let fifoValue = 0;
    let qtyToValue = currentBaseQty;
    for (const batch of remainingBatches) {
      if (qtyToValue <= 0) break;
      const take = Math.min(batch.qty, qtyToValue);
      fifoValue += take * batch.cost;
      qtyToValue -= take;
    }
    // Fallback: if purchase history is incomplete, use weighted avg for remainder
    if (qtyToValue > 0) {
      fifoValue += qtyToValue * avgCostPerUnit;
    }

    // ── Aging classification ────────────────────────────────
    const saleInfo = saleMap[product.id];
    const lastSaleDate = saleInfo?.lastSaleDate ?? null;
    let daysSinceLastSale: number | null = null;
    if (lastSaleDate) {
      const d = new Date(lastSaleDate);
      daysSinceLastSale = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    }

    let agingCategory: InventoryAgingRow["agingCategory"];
    if (daysSinceLastSale === null) {
      agingCategory = "unsold";
    } else if (daysSinceLastSale <= 30) {
      agingCategory = "fast";
    } else if (daysSinceLastSale <= 90) {
      agingCategory = "normal";
    } else {
      agingCategory = "slow";
    }

    totalFifoValue += fifoValue;
    rows.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      category: product.category,
      unitType: product.unit_type,
      boxQty,
      sftQty,
      pieceQty,
      avgCostPerUnit,
      fifoStockValue: round2(fifoValue),
      lastSaleDate,
      daysSinceLastSale,
      agingCategory,
    });
  }

  // Sort: dead/unsold first, then by FIFO value descending
  const agingOrder: Record<InventoryAgingRow["agingCategory"], number> = {
    unsold: 0, slow: 1, normal: 2, fast: 3,
  };
  rows.sort((a, b) => {
    const d = agingOrder[a.agingCategory] - agingOrder[b.agingCategory];
    return d !== 0 ? d : b.fifoStockValue - a.fifoStockValue;
  });

  return { rows, totalFifoValue: round2(totalFifoValue) };
}

export const REPORT_PAGE_SIZE = PAGE_SIZE;

// ─── Low Stock Report ─────────────────────────────────────
export interface LowStockRow {
  productId: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string;
  unitType: string;
  currentStock: number;
  reorderLevel: number;
  suggestedReorderQty: number;
}

export async function fetchLowStockReport(dealerId: string): Promise<LowStockRow[]> {
  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, brand, category, unit_type, reorder_level")
    .eq("dealer_id", dealerId)
    .eq("active", true)
    .order("sku");

  if (!products?.length) return [];

  const ids = products.map((p) => p.id);
  const { data: stocks } = await supabase
    .from("stock")
    .select("product_id, box_qty, piece_qty, sft_qty")
    .eq("dealer_id", dealerId)
    .in("product_id", ids);

  const stockMap = new Map((stocks ?? []).map((s) => [s.product_id, s]));

  const rows: LowStockRow[] = [];
  for (const p of products) {
    const s = stockMap.get(p.id);
    const boxQty = Number(s?.box_qty ?? 0);
    const pieceQty = Number(s?.piece_qty ?? 0);
    const currentStock = boxQty + pieceQty;
    const reorderLevel = p.reorder_level ?? 0;

    if (currentStock <= reorderLevel) {
      rows.push({
        productId: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        category: p.category,
        unitType: p.unit_type,
        currentStock,
        reorderLevel,
        // Suggest enough to reach 2× reorder level buffer
        suggestedReorderQty: Math.max(0, reorderLevel * 2 - currentStock),
      });
    }
  }

  // Sort by most critical first (lowest stock relative to reorder level)
  rows.sort((a, b) => (a.currentStock - a.reorderLevel) - (b.currentStock - b.reorderLevel));
  return rows;
}
