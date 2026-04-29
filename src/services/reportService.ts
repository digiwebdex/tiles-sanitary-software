import { supabase } from "@/integrations/supabase/client";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

const PAGE_SIZE = 25;
const USE_VPS = env.AUTH_BACKEND === "vps";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function vpsRequest<T>(path: string): Promise<T> {
  const res = await vpsAuthedFetch(path);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error((body as any)?.error || `Request failed (${res.status})`);
  }
  return body as T;
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
  if (USE_VPS) {
    const params = new URLSearchParams({ dealerId, page: String(page) });
    if (search?.trim()) params.set("search", search.trim());
    return vpsRequest<{ rows: StockRow[]; total: number }>(`/api/reports/stock?${params}`);
  }

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
      productId: p.id, sku: p.sku, name: p.name, brand: p.brand,
      category: p.category, unitType: p.unit_type,
      boxQty, sftQty, pieceQty, avgCost,
      stockValue: round2(totalQty * avgCost),
      reorderLevel: p.reorder_level, isLow: totalQty <= p.reorder_level,
    };
  });
  return { rows, total: count ?? 0 };
}

// ─── Products Report ──────────────────────────────────────
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
  if (USE_VPS) {
    const params = new URLSearchParams({ dealerId, page: String(page) });
    if (search?.trim()) params.set("search", search.trim());
    return vpsRequest<{ rows: ProductReportRow[]; total: number }>(`/api/reports/products?${params}`);
  }
  let pQuery = supabase
    .from("products")
    .select("id, sku, name, brand, category, unit_type, per_box_sft", { count: "exact" })
    .eq("dealer_id", dealerId).eq("active", true).order("sku");
  if (search?.trim()) {
    pQuery = pQuery.or(`sku.ilike.%${search.trim()}%,name.ilike.%${search.trim()}%,brand.ilike.%${search.trim()}%`);
  }
  pQuery = pQuery.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data: products, count, error } = await pQuery;
  if (error) throw new Error(error.message);
  const ids = (products ?? []).map((p) => p.id);
  if (ids.length === 0) return { rows: [], total: 0 };
  const [purchaseItemsRes, saleItemsRes, stocksRes] = await Promise.all([
    supabase.from("purchase_items").select("product_id, quantity, total").eq("dealer_id", dealerId).in("product_id", ids),
    supabase.from("sale_items").select("product_id, quantity, total").eq("dealer_id", dealerId).in("product_id", ids),
    supabase.from("stock").select("product_id, box_qty, piece_qty, average_cost_per_unit").eq("dealer_id", dealerId).in("product_id", ids),
  ]);
  const purchaseMap: Record<string, { qty: number; amount: number }> = {};
  for (const pi of purchaseItemsRes.data ?? []) {
    if (!purchaseMap[pi.product_id]) purchaseMap[pi.product_id] = { qty: 0, amount: 0 };
    purchaseMap[pi.product_id].qty += Number(pi.quantity);
    purchaseMap[pi.product_id].amount += Number(pi.total);
  }
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
    const cogs = sold.qty * avgCost;
    return {
      productId: p.id, sku: p.sku,
      name: `${p.name}${p.category === 'tiles' && p.per_box_sft ? ` (Box: ${p.per_box_sft}sft)` : ''}`,
      purchasedQty: purchased.qty, purchasedAmount: round2(purchased.amount),
      soldQty: sold.qty, soldAmount: round2(sold.amount),
      profitOrLoss: round2(sold.amount - cogs),
      stockQty, stockAmount: round2(stockQty * avgCost),
    };
  });
  return { rows, total: count ?? 0 };
}

// ─── Brand Stock Report ───────────────────────────────────
export interface BrandStockRow {
  brand: string;
  totalBox: number;
  totalSft: number;
  totalPiece: number;
  totalValue: number;
  productCount: number;
  purchasedQty: number;
  purchasedAmount: number;
  soldQty: number;
  soldAmount: number;
  profitOrLoss: number;
}

export async function fetchBrandStockReport(dealerId: string): Promise<BrandStockRow[]> {
  if (USE_VPS) return vpsRequest<BrandStockRow[]>(`/api/reports/brand-stock?dealerId=${encodeURIComponent(dealerId)}`);
  const { data: products } = await supabase
    .from("products").select("id, brand, unit_type")
    .eq("dealer_id", dealerId).eq("active", true);
  const ids = (products ?? []).map((p) => p.id);
  if (ids.length === 0) return [];
  const [stocksRes, purItemsRes, saleItemsRes] = await Promise.all([
    supabase.from("stock").select("product_id, box_qty, sft_qty, piece_qty, average_cost_per_unit").eq("dealer_id", dealerId).in("product_id", ids),
    supabase.from("purchase_items").select("product_id, quantity, total").eq("dealer_id", dealerId).in("product_id", ids),
    supabase.from("sale_items").select("product_id, quantity, total").eq("dealer_id", dealerId).in("product_id", ids),
  ]);
  const stockMap = new Map((stocksRes.data ?? []).map((s) => [s.product_id, s]));
  const purchaseMap: Record<string, { qty: number; amount: number }> = {};
  for (const pi of purItemsRes.data ?? []) {
    if (!purchaseMap[pi.product_id]) purchaseMap[pi.product_id] = { qty: 0, amount: 0 };
    purchaseMap[pi.product_id].qty += Number(pi.quantity);
    purchaseMap[pi.product_id].amount += Number(pi.total);
  }
  const saleMap: Record<string, { qty: number; amount: number }> = {};
  for (const si of saleItemsRes.data ?? []) {
    if (!saleMap[si.product_id]) saleMap[si.product_id] = { qty: 0, amount: 0 };
    saleMap[si.product_id].qty += Number(si.quantity);
    saleMap[si.product_id].amount += Number(si.total);
  }
  const brandMap: Record<string, BrandStockRow> = {};
  for (const p of products ?? []) {
    const brand = p.brand || "Others";
    if (!brandMap[brand]) {
      brandMap[brand] = {
        brand, totalBox: 0, totalSft: 0, totalPiece: 0, totalValue: 0, productCount: 0,
        purchasedQty: 0, purchasedAmount: 0, soldQty: 0, soldAmount: 0, profitOrLoss: 0,
      };
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
    const purchased = purchaseMap[p.id] ?? { qty: 0, amount: 0 };
    const sold = saleMap[p.id] ?? { qty: 0, amount: 0 };
    brandMap[brand].purchasedQty += purchased.qty;
    brandMap[brand].purchasedAmount += purchased.amount;
    brandMap[brand].soldQty += sold.qty;
    brandMap[brand].soldAmount += sold.amount;
    brandMap[brand].profitOrLoss += sold.amount - (sold.qty * avgCost);
  }
  return Object.values(brandMap)
    .map((b) => ({ ...b, totalValue: round2(b.totalValue), totalSft: round2(b.totalSft), purchasedAmount: round2(b.purchasedAmount), soldAmount: round2(b.soldAmount), profitOrLoss: round2(b.profitOrLoss) }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

// ─── Sales Report ─────────────────────────────────────────
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
  if (USE_VPS) {
    const params = new URLSearchParams({ dealerId, mode, year: String(year) });
    if (month) params.set("month", String(month));
    return vpsRequest<SalesReportRow[]>(`/api/reports/sales?${params}`);
  }
  let query = supabase
    .from("sales")
    .select("sale_date, total_amount, paid_amount, profit, due_amount, total_sft")
    .eq("dealer_id", dealerId).order("sale_date");
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
    .map((b) => ({ ...b, totalAmount: round2(b.totalAmount), totalCollection: round2(b.totalCollection), totalProfit: round2(b.totalProfit), totalDue: round2(b.totalDue), totalSft: round2(b.totalSft) }));
}

// ─── Retailer Sales Report ────────────────────────────────
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
  if (USE_VPS) {
    const params = new URLSearchParams({ dealerId, year: String(year) });
    if (customerType) params.set("customerType", customerType);
    return vpsRequest<RetailerSalesRow[]>(`/api/reports/retailer-sales?${params}`);
  }
  let query = supabase
    .from("sales")
    .select("customer_id, total_sft, total_amount, due_amount, customers(name, type)")
    .eq("dealer_id", dealerId)
    .gte("sale_date", `${year}-01-01`).lte("sale_date", `${year}-12-31`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const map: Record<string, RetailerSalesRow> = {};
  for (const row of data ?? []) {
    const cust = (row as any).customers;
    const type = cust?.type ?? "customer";
    if (customerType && type !== customerType) continue;
    const cid = row.customer_id;
    if (!map[cid]) {
      map[cid] = { customerId: cid, customerName: cust?.name ?? "—", customerType: type, totalSft: 0, totalAmount: 0, totalDue: 0, saleCount: 0 };
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

// ─── Product History ──────────────────────────────────────
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
  if (USE_VPS) {
    const params = new URLSearchParams({ dealerId, productId, page: String(page) });
    return vpsRequest<{ rows: ProductHistoryRow[]; total: number }>(`/api/reports/product-history?${params}`);
  }
  const [purchaseRes, saleRes, returnRes] = await Promise.all([
    supabase.from("purchase_items").select("id, quantity, purchase_rate, total, purchases(purchase_date, invoice_number)").eq("dealer_id", dealerId).eq("product_id", productId),
    supabase.from("sale_items").select("id, quantity, sale_rate, total, sales(sale_date, invoice_number)").eq("dealer_id", dealerId).eq("product_id", productId),
    supabase.from("sales_returns").select("id, qty, refund_amount, return_date, is_broken, sales(invoice_number)").eq("dealer_id", dealerId).eq("product_id", productId),
  ]);
  const rows: ProductHistoryRow[] = [];
  for (const pi of purchaseRes.data ?? []) {
    const p = (pi as any).purchases;
    rows.push({ id: pi.id, date: p?.purchase_date ?? "", type: "purchase", quantity: Number(pi.quantity), rate: Number(pi.purchase_rate), total: Number(pi.total), reference: p?.invoice_number ?? "—" });
  }
  for (const si of saleRes.data ?? []) {
    const s = (si as any).sales;
    rows.push({ id: si.id, date: s?.sale_date ?? "", type: "sale", quantity: Number(si.quantity), rate: Number(si.sale_rate), total: Number(si.total), reference: s?.invoice_number ?? "—" });
  }
  for (const sr of returnRes.data ?? []) {
    const s = (sr as any).sales;
    rows.push({ id: sr.id, date: sr.return_date, type: "return", quantity: Number(sr.qty), rate: 0, total: Number(sr.refund_amount), reference: `${s?.invoice_number ?? "—"}${sr.is_broken ? " (broken)" : ""}` });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.length;
  return { rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total };
}

// ─── Customer Due Report ──────────────────────────────────
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
  if (USE_VPS) {
    return vpsRequest<{ rows: CustomerDueRow[]; total: number }>(`/api/reports/customer-due?dealerId=${encodeURIComponent(dealerId)}&page=${page}`);
  }
  const { data: ledgerData, error: lErr } = await supabase
    .from("customer_ledger").select("customer_id, amount").eq("dealer_id", dealerId);
  if (lErr) throw new Error(lErr.message);
  const { data: customers, error: cErr } = await supabase
    .from("customers").select("id, name, type").eq("dealer_id", dealerId);
  if (cErr) throw new Error(cErr.message);
  const custMap = new Map((customers ?? []).map((c) => [c.id, c]));
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
      return { customerId: cid, customerName: cust?.name ?? "—", customerType: cust?.type ?? "customer", totalDebit: round2(b.debit), totalCredit: round2(b.credit), balance: round2(b.debit - b.credit) };
    })
    .filter((r) => r.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  return { rows: allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: allRows.length };
}

// ─── Supplier Payable Report ──────────────────────────────
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
  if (USE_VPS) {
    return vpsRequest<{ rows: SupplierPayableRow[]; total: number }>(`/api/reports/supplier-payable?dealerId=${encodeURIComponent(dealerId)}&page=${page}`);
  }
  const { data: ledgerData, error: lErr } = await supabase
    .from("supplier_ledger").select("supplier_id, amount").eq("dealer_id", dealerId);
  if (lErr) throw new Error(lErr.message);
  const { data: suppliers, error: sErr } = await supabase
    .from("suppliers").select("id, name").eq("dealer_id", dealerId);
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
      return { supplierId: sid, supplierName: supp?.name ?? "—", totalDebit: round2(b.debit), totalCredit: round2(b.credit), balance: round2(b.credit - b.debit) };
    })
    .filter((r) => r.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  return { rows: allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: allRows.length };
}

// ─── Accounting Summary ───────────────────────────────────
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
  if (USE_VPS) {
    return vpsRequest<AccountingSummaryRow[]>(`/api/reports/accounting-summary?dealerId=${encodeURIComponent(dealerId)}&year=${year}`);
  }
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const [salesRes, purchasesRes, expensesRes, cashRes] = await Promise.all([
    supabase.from("sales").select("sale_date, total_amount, paid_amount, profit, due_amount, total_sft").eq("dealer_id", dealerId).gte("sale_date", yearStart).lte("sale_date", yearEnd),
    supabase.from("purchases").select("purchase_date, total_amount").eq("dealer_id", dealerId).gte("purchase_date", yearStart).lte("purchase_date", yearEnd),
    supabase.from("expenses").select("expense_date, amount").eq("dealer_id", dealerId).gte("expense_date", yearStart).lte("expense_date", yearEnd),
    supabase.from("cash_ledger").select("entry_date, amount").eq("dealer_id", dealerId).gte("entry_date", yearStart).lte("entry_date", yearEnd),
  ]);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const buckets = MONTHS.map((m) => ({ month: m, totalSales: 0, totalCollection: 0, totalDue: 0, totalSftSold: 0, totalPurchases: 0, totalExpenses: 0, netProfit: 0, cashIn: 0, cashOut: 0 }));
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
  return buckets.map((b) => ({ ...b, totalSales: round2(b.totalSales), totalCollection: round2(b.totalCollection), totalDue: round2(b.totalDue), totalSftSold: round2(b.totalSftSold), totalPurchases: round2(b.totalPurchases), totalExpenses: round2(b.totalExpenses), netProfit: round2(b.netProfit), cashIn: round2(b.cashIn), cashOut: round2(b.cashOut) }));
}

// ─── Inventory Aging Report ───────────────────────────────
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
  if (USE_VPS) {
    return vpsRequest<{ rows: InventoryAgingRow[]; totalFifoValue: number }>(`/api/reports/inventory-aging?dealerId=${encodeURIComponent(dealerId)}`);
  }
  throw new Error("Inventory aging report requires VPS backend.");
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
  if (USE_VPS) {
    return vpsRequest<LowStockRow[]>(`/api/reports/low-stock?dealerId=${encodeURIComponent(dealerId)}`);
  }
  const { data: products } = await supabase
    .from("products").select("id, sku, name, brand, category, unit_type, reorder_level")
    .eq("dealer_id", dealerId).eq("active", true).order("sku");
  if (!products?.length) return [];
  const ids = products.map((p) => p.id);
  const { data: stocks } = await supabase
    .from("stock").select("product_id, box_qty, piece_qty, sft_qty")
    .eq("dealer_id", dealerId).in("product_id", ids);
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
        productId: p.id, sku: p.sku, name: p.name, brand: p.brand, category: p.category, unitType: p.unit_type,
        currentStock, reorderLevel,
        suggestedReorderQty: Math.max(0, reorderLevel * 2 - currentStock),
      });
    }
  }
  rows.sort((a, b) => (a.currentStock - a.reorderLevel) - (b.currentStock - b.reorderLevel));
  return rows;
}
