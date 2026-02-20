import { supabase } from "@/integrations/supabase/client";

export interface DashboardData {
  todaySales: number;
  todayCollection: number;
  todayProfit: number;
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
  return Math.round((n || 0) * 100) / 100;
}

const SAFE_DEFAULTS: DashboardData = {
  todaySales: 0,
  todayCollection: 0,
  todayProfit: 0,
  monthlySales: 0,
  monthlyCollection: 0,
  monthlyProfit: 0,
  totalStockValue: 0,
  totalCustomerDue: 0,
  totalSupplierPayable: 0,
  lowStockItems: [],
  monthlySalesChart: MONTHS.map((month) => ({ month, amount: 0 })),
  categorySales: [],
};

export const dashboardService = {
  async getData(dealerId: string): Promise<DashboardData> {
    if (!dealerId) return SAFE_DEFAULTS;

    try {
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
        supabase
          .from("sales")
          .select("total_amount, paid_amount, profit")
          .eq("dealer_id", dealerId)
          .eq("sale_date", todayStr),

        supabase
          .from("sales")
          .select("total_amount, profit, paid_amount")
          .eq("dealer_id", dealerId)
          .gte("sale_date", monthStart)
          .lte("sale_date", todayStr),

        supabase
          .from("sales")
          .select("sale_date, total_amount")
          .eq("dealer_id", dealerId)
          .gte("sale_date", yearStart)
          .order("sale_date"),

        supabase
          .from("stock")
          .select("product_id, box_qty, piece_qty, sft_qty, average_cost_per_unit")
          .eq("dealer_id", dealerId),

        supabase
          .from("products")
          .select("id, name, sku, category, unit_type, reorder_level")
          .eq("dealer_id", dealerId)
          .eq("active", true),

        supabase
          .from("customer_ledger")
          .select("amount")
          .eq("dealer_id", dealerId),

        supabase
          .from("supplier_ledger")
          .select("amount")
          .eq("dealer_id", dealerId),

        supabase
          .from("sale_items")
          .select("total, products(category)")
          .eq("dealer_id", dealerId),
      ]);

      // --- Sales summary (0 on null/error) ---
      const todaySalesRows = todaySalesRes.data ?? [];
      const todaySales = todaySalesRows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      const todayCollection = todaySalesRows.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0);
      const todayProfit = todaySalesRows.reduce((s, r) => s + (Number((r as any).profit) || 0), 0);

      const monthlySalesRows = monthlySalesRes.data ?? [];
      const monthlySales = monthlySalesRows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      const monthlyProfit = monthlySalesRows.reduce((s, r) => s + (Number(r.profit) || 0), 0);
      const monthlyCollection = monthlySalesRows.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0);

      // --- Due summary (0 on null/error) ---
      const totalCustomerDue = (customerLedgerRes.data ?? []).reduce(
        (s, r) => s + (Number(r.amount) || 0), 0
      );
      const totalSupplierPayable = -(supplierLedgerRes.data ?? []).reduce(
        (s, r) => s + (Number(r.amount) || 0), 0
      );

      // --- Stock summary (skip bad/null rows) ---
      const productMap = new Map((productsRes.data ?? []).map((p) => [p.id, p]));
      const stockRows = stockRes.data ?? [];
      let totalStockValue = 0;
      const lowStockItems: DashboardData["lowStockItems"] = [];

      for (const s of stockRows) {
        const qty = (Number(s.box_qty) || 0) + (Number(s.piece_qty) || 0);
        const cost = Number(s.average_cost_per_unit) || 0;
        totalStockValue += qty * cost;

        const product = s.product_id ? productMap.get(s.product_id) : undefined;
        if (product && qty <= (product.reorder_level ?? 0)) {
          lowStockItems.push({
            id: product.id,
            name: product.name ?? "—",
            sku: product.sku ?? "—",
            category: product.category ?? "other",
            currentQty: qty,
            reorderLevel: product.reorder_level ?? 0,
          });
        }
      }

      // --- Monthly chart (guard null/invalid sale_date) ---
      const monthBuckets = new Array(12).fill(0);
      for (const row of yearSalesRes.data ?? []) {
        if (!row.sale_date) continue;
        const d = new Date(row.sale_date);
        if (isNaN(d.getTime())) continue;
        monthBuckets[d.getMonth()] += Number(row.total_amount) || 0;
      }
      const monthlySalesChart = MONTHS.map((month, i) => ({
        month,
        amount: round2(monthBuckets[i]),
      }));

      // --- Category sales (skip items with no product join) ---
      const catMap: Record<string, number> = {};
      for (const item of categorySalesRes.data ?? []) {
        const cat = (item as any).products?.category ?? "other";
        catMap[cat] = (catMap[cat] || 0) + (Number(item.total) || 0);
      }
      const categorySales = Object.entries(catMap).map(([category, amount]) => ({
        category: category.charAt(0).toUpperCase() + category.slice(1),
        amount: round2(amount),
      }));

      return {
        todaySales: round2(todaySales),
        todayCollection: round2(todayCollection),
        todayProfit: round2(todayProfit),
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
    } catch (err) {
      // Never crash the dashboard — return safe zero-state
      console.error("[dashboardService] getData failed, returning defaults:", err);
      return SAFE_DEFAULTS;
    }
  },
};
