import { supabase } from "@/integrations/supabase/client";

export interface DashboardData {
  todaySales: number;
  todayCollection: number;
  monthlySales: number;
  monthlyCollection: number;
  monthlyProfit: number;
  totalStockValue: number;
  totalCustomerDue: number;
  totalSupplierPayable: number;
  lowStockItems: {
    id: string;
    name: string;
    sku: string;
    category: string;
    currentQty: number;
    reorderLevel: number;
  }[];
  monthlySalesChart: { month: string; amount: number }[];
  categorySales: { category: string; amount: number }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export const dashboardService = {
  async getData(dealerId: string): Promise<DashboardData> {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const yearStart = `${now.getFullYear()}-01-01`;
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const [
      todaySalesRes,
      monthlySalesRes,
      yearSalesRes,
      stockRes,
      productsRes,
      customerLedgerRes,
      supplierLedgerRes,
      categorySalesRes,
    ] = await Promise.all([
      // Today's sales
      supabase
        .from("sales")
        .select("total_amount, paid_amount")
        .eq("dealer_id", dealerId)
        .eq("sale_date", todayStr),

      // Current month sales + profit + collection
      supabase
        .from("sales")
        .select("total_amount, profit, paid_amount")
        .eq("dealer_id", dealerId)
        .gte("sale_date", monthStart)
        .lte("sale_date", todayStr),

      // Year sales for chart
      supabase
        .from("sales")
        .select("sale_date, total_amount")
        .eq("dealer_id", dealerId)
        .gte("sale_date", yearStart)
        .order("sale_date"),

      // Stock
      supabase
        .from("stock")
        .select("product_id, box_qty, piece_qty, sft_qty, average_cost_per_unit")
        .eq("dealer_id", dealerId),

      // Products for low stock
      supabase
        .from("products")
        .select("id, name, sku, category, unit_type, reorder_level")
        .eq("dealer_id", dealerId)
        .eq("active", true),

      // Customer ledger — all entries for due calculation (debit - credit)
      supabase
        .from("customer_ledger")
        .select("amount")
        .eq("dealer_id", dealerId),

      // Supplier ledger — all entries for payable calculation (credit - debit)
      supabase
        .from("supplier_ledger")
        .select("amount")
        .eq("dealer_id", dealerId),

      // Category-wise sales
      supabase
        .from("sale_items")
        .select("total, products(category)")
        .eq("dealer_id", dealerId),
    ]);

    // Today sales & collection
    const todaySales = (todaySalesRes.data ?? []).reduce((s, r) => s + Number(r.total_amount), 0);
    const todayCollection = (todaySalesRes.data ?? []).reduce((s, r) => s + Number(r.paid_amount), 0);

    // Monthly sales, profit & collection
    const monthlySales = (monthlySalesRes.data ?? []).reduce((s, r) => s + Number(r.total_amount), 0);
    const monthlyProfit = (monthlySalesRes.data ?? []).reduce((s, r) => s + Number(r.profit), 0);
    const monthlyCollection = (monthlySalesRes.data ?? []).reduce((s, r) => s + Number(r.paid_amount), 0);

    // Customer due = sum of all ledger amounts (positive = debit/sale, negative = credit/payment)
    // Net positive = customer owes us
    const totalCustomerDue = (customerLedgerRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);

    // Supplier payable = negative sum (purchases are negative amounts in supplier ledger)
    // Net negative = we owe supplier, so negate for display
    const totalSupplierPayable = -(supplierLedgerRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);

    // Stock value & low stock
    const productMap = new Map((productsRes.data ?? []).map((p) => [p.id, p]));
    const stockData = stockRes.data ?? [];
    let totalStockValue = 0;
    const lowStockItems: DashboardData["lowStockItems"] = [];

    for (const s of stockData) {
      const qty = Number(s.box_qty) + Number(s.piece_qty);
      totalStockValue += qty * Number(s.average_cost_per_unit);

      const product = productMap.get(s.product_id);
      if (product && qty <= product.reorder_level) {
        lowStockItems.push({
          id: product.id,
          name: product.name,
          sku: product.sku,
          category: product.category,
          currentQty: qty,
          reorderLevel: product.reorder_level,
        });
      }
    }

    // Monthly sales chart
    const monthBuckets = new Array(12).fill(0);
    for (const row of yearSalesRes.data ?? []) {
      const m = new Date(row.sale_date).getMonth();
      monthBuckets[m] += Number(row.total_amount);
    }
    const monthlySalesChart = MONTHS.map((month, i) => ({
      month,
      amount: round2(monthBuckets[i]),
    }));

    // Category-wise sales
    const catMap: Record<string, number> = {};
    for (const item of categorySalesRes.data ?? []) {
      const cat = (item as any).products?.category ?? "other";
      catMap[cat] = (catMap[cat] || 0) + Number(item.total);
    }
    const categorySales = Object.entries(catMap).map(([category, amount]) => ({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      amount: round2(amount),
    }));

    return {
      todaySales: round2(todaySales),
      todayCollection: round2(todayCollection),
      monthlySales: round2(monthlySales),
      monthlyCollection: round2(monthlyCollection),
      monthlyProfit: round2(monthlyProfit),
      totalStockValue: round2(totalStockValue),
      totalCustomerDue: round2(totalCustomerDue),
      totalSupplierPayable: round2(totalSupplierPayable),
      lowStockItems,
      monthlySalesChart,
      categorySales,
    };
  },
};
