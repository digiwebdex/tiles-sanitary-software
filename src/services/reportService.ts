import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 25;

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
  // products with stock join
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
      stockValue: Math.round(totalQty * avgCost * 100) / 100,
      reorderLevel: p.reorder_level,
      isLow: totalQty <= p.reorder_level,
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
    .map((b) => ({ ...b, totalValue: Math.round(b.totalValue * 100) / 100, totalSft: Math.round(b.totalSft * 100) / 100 }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

// ─── Sales Report (Daily/Monthly) ─────────────────────────
export interface SalesReportRow {
  date: string;
  count: number;
  totalAmount: number;
  totalProfit: number;
  totalDue: number;
}

export async function fetchSalesReport(
  dealerId: string,
  mode: "daily" | "monthly",
  year: number,
  month?: number // 1-12, for daily mode
): Promise<SalesReportRow[]> {
  let query = supabase
    .from("sales")
    .select("sale_date, total_amount, profit, due_amount")
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
    const key = mode === "daily"
      ? row.sale_date
      : row.sale_date.substring(0, 7); // YYYY-MM

    if (!buckets[key]) {
      buckets[key] = { date: key, count: 0, totalAmount: 0, totalProfit: 0, totalDue: 0 };
    }
    buckets[key].count += 1;
    buckets[key].totalAmount += Number(row.total_amount);
    buckets[key].totalProfit += Number(row.profit);
    buckets[key].totalDue += Number(row.due_amount);
  }

  return Object.values(buckets)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => ({
      ...b,
      totalAmount: Math.round(b.totalAmount * 100) / 100,
      totalProfit: Math.round(b.totalProfit * 100) / 100,
      totalDue: Math.round(b.totalDue * 100) / 100,
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
  year: number
): Promise<RetailerSalesRow[]> {
  const { data, error } = await supabase
    .from("sales")
    .select("customer_id, total_sft, total_amount, due_amount, customers(name, type)")
    .eq("dealer_id", dealerId)
    .gte("sale_date", `${year}-01-01`)
    .lte("sale_date", `${year}-12-31`);
  if (error) throw new Error(error.message);

  const map: Record<string, RetailerSalesRow> = {};
  for (const row of data ?? []) {
    const cid = row.customer_id;
    if (!map[cid]) {
      map[cid] = {
        customerId: cid,
        customerName: (row as any).customers?.name ?? "—",
        customerType: (row as any).customers?.type ?? "—",
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
    .map((r) => ({
      ...r,
      totalSft: Math.round(r.totalSft * 100) / 100,
      totalAmount: Math.round(r.totalAmount * 100) / 100,
      totalDue: Math.round(r.totalDue * 100) / 100,
    }))
    .sort((a, b) => b.totalSft - a.totalSft);
}

// ─── Product History ──────────────────────────────────────
export interface ProductHistoryRow {
  id: string;
  date: string;
  type: "purchase" | "sale";
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
  const [purchaseRes, saleRes] = await Promise.all([
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

  rows.sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.length;
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { rows: paged, total };
}

// ─── Monthly Accounting Summary ───────────────────────────
export interface AccountingSummaryRow {
  month: string;
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  totalProfit: number;
  totalDue: number;
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
      .select("sale_date, total_amount, profit, due_amount")
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
    totalPurchases: 0,
    totalExpenses: 0,
    totalProfit: 0,
    totalDue: 0,
    cashIn: 0,
    cashOut: 0,
  }));

  for (const r of salesRes.data ?? []) {
    const m = new Date(r.sale_date).getMonth();
    buckets[m].totalSales += Number(r.total_amount);
    buckets[m].totalProfit += Number(r.profit);
    buckets[m].totalDue += Number(r.due_amount);
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
    totalSales: Math.round(b.totalSales * 100) / 100,
    totalPurchases: Math.round(b.totalPurchases * 100) / 100,
    totalExpenses: Math.round(b.totalExpenses * 100) / 100,
    totalProfit: Math.round(b.totalProfit * 100) / 100,
    totalDue: Math.round(b.totalDue * 100) / 100,
    cashIn: Math.round(b.cashIn * 100) / 100,
    cashOut: Math.round(b.cashOut * 100) / 100,
  }));
}

export const REPORT_PAGE_SIZE = PAGE_SIZE;
