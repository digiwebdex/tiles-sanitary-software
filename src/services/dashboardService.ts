import { supabase } from "@/integrations/supabase/client";

export interface DashboardData {
  todaySales: number;
  monthlySales: number;
  monthlyProfit: number;
  totalStockValue: number;
  totalDue: number;
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

export const dashboardService = {
  async getData(dealerId: string): Promise<DashboardData> {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const yearStart = `${now.getFullYear()}-01-01`;
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    // Run all queries in parallel for performance
    const [
      todaySalesRes,
      monthlySalesRes,
      yearSalesRes,
      stockRes,
      productsRes,
      dueRes,
      categorySalesRes,
    ] = await Promise.all([
      // Today's sales total
      supabase
        .from("sales")
        .select("total_amount")
        .eq("dealer_id", dealerId)
        .eq("sale_date", todayStr),

      // Current month sales + profit
      supabase
        .from("sales")
        .select("total_amount, profit")
        .eq("dealer_id", dealerId)
        .gte("sale_date", monthStart)
        .lte("sale_date", todayStr),

      // Year sales for chart (just date + amount)
      supabase
        .from("sales")
        .select("sale_date, total_amount")
        .eq("dealer_id", dealerId)
        .gte("sale_date", yearStart)
        .order("sale_date"),

      // Stock with product info for value + low stock
      supabase
        .from("stock")
        .select("product_id, box_qty, piece_qty, sft_qty, average_cost_per_unit")
        .eq("dealer_id", dealerId),

      // Products for low stock check
      supabase
        .from("products")
        .select("id, name, sku, category, unit_type, reorder_level")
        .eq("dealer_id", dealerId)
        .eq("active", true),

      // Total due from sales
      supabase
        .from("sales")
        .select("due_amount")
        .eq("dealer_id", dealerId)
        .gt("due_amount", 0),

      // Category-wise sales (current year)
      supabase
        .from("sale_items")
        .select("total, products(category)")
        .eq("dealer_id", dealerId),
    ]);

    // Today sales
    const todaySales = (todaySalesRes.data ?? []).reduce(
      (s, r) => s + Number(r.total_amount), 0
    );

    // Monthly sales & profit
    const monthlySales = (monthlySalesRes.data ?? []).reduce(
      (s, r) => s + Number(r.total_amount), 0
    );
    const monthlyProfit = (monthlySalesRes.data ?? []).reduce(
      (s, r) => s + Number(r.profit), 0
    );

    // Total due
    const totalDue = (dueRes.data ?? []).reduce(
      (s, r) => s + Number(r.due_amount), 0
    );

    // Stock value & low stock
    const productMap = new Map(
      (productsRes.data ?? []).map((p) => [p.id, p])
    );
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
      amount: Math.round(monthBuckets[i] * 100) / 100,
    }));

    // Category-wise sales
    const catMap: Record<string, number> = {};
    for (const item of categorySalesRes.data ?? []) {
      const cat = (item as any).products?.category ?? "other";
      catMap[cat] = (catMap[cat] || 0) + Number(item.total);
    }
    const categorySales = Object.entries(catMap).map(([category, amount]) => ({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      amount: Math.round(amount * 100) / 100,
    }));

    return {
      todaySales: Math.round(todaySales * 100) / 100,
      monthlySales: Math.round(monthlySales * 100) / 100,
      monthlyProfit: Math.round(monthlyProfit * 100) / 100,
      totalStockValue: Math.round(totalStockValue * 100) / 100,
      totalDue: Math.round(totalDue * 100) / 100,
      lowStockItems,
      monthlySalesChart,
      categorySales,
    };
  },
};
