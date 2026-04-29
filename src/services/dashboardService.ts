import { supabase } from "@/integrations/supabase/client";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export interface DashboardData {
  // Today
  todaySales: number;
  todayCollection: number;
  todayProfit: number;
  todaySftSold: number;
  // This Month
  monthlySales: number;
  monthlyCollection: number;
  monthlyProfit: number;
  monthlyPurchase: number;
  // Financial Summary
  totalCustomerDue: number;
  totalSupplierPayable: number;
  cashInHand: number;
  totalStockValue: number;
  // Alerts
  lowStockItems: {
    id: string;
    name: string;
    sku: string;
    category: string;
    currentQty: number;
    reorderLevel: number;
  }[];
  overdueCustomerCount: number;
  creditExceededCount: number;
  deadStockCount: number;
  // Charts
  monthlySalesChart: { month: string; amount: number }[];
  categorySales: { category: string; amount: number }[];
  topCustomers: { name: string; amount: number }[];
  productPerformance: { name: string; amount: number }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function round2(n: number) {
  return Math.round((n || 0) * 100) / 100;
}

const SAFE_DEFAULTS: DashboardData = {
  todaySales: 0,
  todayCollection: 0,
  todayProfit: 0,
  todaySftSold: 0,
  monthlySales: 0,
  monthlyCollection: 0,
  monthlyProfit: 0,
  monthlyPurchase: 0,
  totalCustomerDue: 0,
  totalSupplierPayable: 0,
  cashInHand: 0,
  totalStockValue: 0,
  lowStockItems: [],
  overdueCustomerCount: 0,
  creditExceededCount: 0,
  deadStockCount: 0,
  monthlySalesChart: MONTHS.map((month) => ({ month, amount: 0 })),
  categorySales: [],
  topCustomers: [],
  productPerformance: [],
};

async function getDataFromVps(dealerId: string): Promise<DashboardData> {
  const res = await vpsAuthedFetch(`/api/dashboard?dealerId=${encodeURIComponent(dealerId)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Dashboard request failed (${res.status})`);
  }
  const body = (await res.json()) as Partial<DashboardData>;
  // Merge with defaults so any field the backend doesn't return yet stays safe.
  return { ...SAFE_DEFAULTS, ...body };
}

export const dashboardService = {
  async getData(dealerId: string): Promise<DashboardData> {
    if (!dealerId) return SAFE_DEFAULTS;

    // Phase 2: when auth is on VPS, the dashboard MUST be served by VPS too —
    // otherwise users see an empty Supabase dashboard. No silent fallback to
    // Supabase here, because that's the bug we're fixing for live dealers.
    if (env.AUTH_BACKEND === "vps") {
      try {
        return await getDataFromVps(dealerId);
      } catch (err) {
        console.error("[dashboardService] VPS load failed:", err);
        return SAFE_DEFAULTS;
      }
    }

    try {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const yearStart = `${now.getFullYear()}-01-01`;
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      // 90 days ago for dead stock detection
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000).toISOString().split("T")[0];
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().split("T")[0];

      const [
        todaySalesRes,
        todaySftRes,
        monthlySalesRes,
        monthlyPurchaseRes,
        yearSalesRes,
        stockRes,
        productsRes,
        customerLedgerRes,
        supplierLedgerRes,
        cashLedgerRes,
        categorySalesRes,
        recentSaleProductsRes,
        customersWithDueRes,
        topCustomersRes,
        productPerfRes,
      ] = await Promise.all([
        // Today sales: total_amount, paid_amount, profit
        supabase
          .from("sales")
          .select("total_amount, paid_amount, profit")
          .eq("dealer_id", dealerId)
          .eq("sale_date", todayStr),

        // Today SFT sold from sale_items joined to products
        supabase
          .from("sales")
          .select("total_sft")
          .eq("dealer_id", dealerId)
          .eq("sale_date", todayStr),

        // Monthly sales
        supabase
          .from("sales")
          .select("total_amount, profit, paid_amount")
          .eq("dealer_id", dealerId)
          .gte("sale_date", monthStart)
          .lte("sale_date", todayStr),

        // Monthly purchases total
        supabase
          .from("purchases")
          .select("total_amount")
          .eq("dealer_id", dealerId)
          .gte("purchase_date", monthStart)
          .lte("purchase_date", todayStr),

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

        // Products
        supabase
          .from("products")
          .select("id, name, sku, category, unit_type, reorder_level")
          .eq("dealer_id", dealerId)
          .eq("active", true),

        // Customer ledger for receivable
        supabase
          .from("customer_ledger")
          .select("amount")
          .eq("dealer_id", dealerId),

        // Supplier ledger for payable
        supabase
          .from("supplier_ledger")
          .select("amount")
          .eq("dealer_id", dealerId),

        // Cash ledger for cash in hand
        supabase
          .from("cash_ledger")
          .select("amount, type")
          .eq("dealer_id", dealerId),

        // Category sales (all time for pie)
        supabase
          .from("sale_items")
          .select("total, products(category)")
          .eq("dealer_id", dealerId),

        // Products sold in last 90 days (for dead stock calculation)
        supabase
          .from("sales")
          .select("id")
          .eq("dealer_id", dealerId)
          .gte("sale_date", ninetyDaysAgo),

        // Customers with due amounts for overdue / credit exceeded alerts
        supabase
          .from("customers")
          .select("id, credit_limit, max_overdue_days")
          .eq("dealer_id", dealerId)
          .eq("status", "active"),

        // Top customers by sales amount
        supabase
          .from("sales")
          .select("customer_id, total_amount, customers(name)")
          .eq("dealer_id", dealerId)
          .gte("sale_date", yearStart),

        // Product performance (top products by sale amount)
        supabase
          .from("sale_items")
          .select("total, products(name)")
          .eq("dealer_id", dealerId),
      ]);

      // --- Today ---
      const todaySalesRows = todaySalesRes.data ?? [];
      const todaySales = todaySalesRows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      const todayCollection = todaySalesRows.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0);
      const todayProfit = todaySalesRows.reduce((s, r) => s + (Number((r as any).profit) || 0), 0);
      const todaySftSold = (todaySftRes.data ?? []).reduce((s, r) => s + (Number(r.total_sft) || 0), 0);

      // --- Monthly ---
      const monthlySalesRows = monthlySalesRes.data ?? [];
      const monthlySales = monthlySalesRows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      const monthlyProfit = monthlySalesRows.reduce((s, r) => s + (Number(r.profit) || 0), 0);
      const monthlyCollection = monthlySalesRows.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0);
      const monthlyPurchase = (monthlyPurchaseRes.data ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);

      // --- Financial ---
      const totalCustomerDue = (customerLedgerRes.data ?? []).reduce(
        (s, r) => s + (Number(r.amount) || 0), 0
      );
      const totalSupplierPayable = -(supplierLedgerRes.data ?? []).reduce(
        (s, r) => s + (Number(r.amount) || 0), 0
      );
      // Cash in hand: receipts (positive) minus payments/expenses (negative entries)
      const cashInHand = (cashLedgerRes.data ?? []).reduce((s, r) => {
        const amt = Number(r.amount) || 0;
        const t = r.type as string;
        if (t === "receipt" || t === "sale") return s + amt;
        if (t === "payment" || t === "expense" || t === "purchase") return s - amt;
        return s + amt; // adjustments as-is
      }, 0);

      // --- Stock ---
      const productMap = new Map((productsRes.data ?? []).map((p) => [p.id, p]));
      const stockRows = stockRes.data ?? [];
      let totalStockValue = 0;
      const lowStockItems: DashboardData["lowStockItems"] = [];
      let deadStockCount = 0;

      // Products sold recently (last 90 days) — use sale_items grouped by product_id
      const recentSaleIds = new Set((recentSaleProductsRes.data ?? []).map((s) => s.id));
      // We need product_ids from those sales — fetch separately is complex so we approximate:
      // dead stock = product has stock but zero sales in last 90 days
      // We'll fetch this as a separate simple query approach below
      const recentlySoldProductsRes = await supabase
        .from("sale_items")
        .select("product_id")
        .eq("dealer_id", dealerId)
        .in("sale_id", recentSaleIds.size > 0 ? Array.from(recentSaleIds).slice(0, 500) : ["__none__"]);

      const recentlySoldProductIds = new Set(
        (recentlySoldProductsRes.data ?? []).map((r) => r.product_id)
      );

      for (const s of stockRows) {
        const qty = (Number(s.box_qty) || 0) + (Number(s.piece_qty) || 0) + (Number(s.sft_qty) || 0);
        const cost = Number(s.average_cost_per_unit) || 0;
        totalStockValue += qty * cost;

        const product = s.product_id ? productMap.get(s.product_id) : undefined;
        if (!product) continue;

        if (qty > 0 && qty <= (product.reorder_level ?? 0)) {
          lowStockItems.push({
            id: product.id,
            name: product.name ?? "—",
            sku: product.sku ?? "—",
            category: product.category ?? "other",
            currentQty: qty,
            reorderLevel: product.reorder_level ?? 0,
          });
        }

        // Dead stock: has inventory but not sold in 90 days
        if (qty > 0 && s.product_id && !recentlySoldProductIds.has(s.product_id)) {
          deadStockCount++;
        }
      }

      // --- Credit Alerts ---
      // Fetch customer outstanding to detect overdue and credit exceeded
      // Lightweight approach: count customers who have positive customer_ledger balance and have credit/overdue settings
      const customers = customersWithDueRes.data ?? [];
      let overdueCustomerCount = 0;
      let creditExceededCount = 0;

      if (customers.length > 0) {
        // Get customer-level outstanding from ledger
        const custLedgerRes = await supabase
          .from("customer_ledger")
          .select("customer_id, amount, type")
          .eq("dealer_id", dealerId);

        const custOutstanding: Record<string, number> = {};
        for (const row of custLedgerRes.data ?? []) {
          const cid = row.customer_id;
          const amt = Number(row.amount) || 0;
          const t = row.type as string;
          if (!custOutstanding[cid]) custOutstanding[cid] = 0;
          if (t === "sale" || t === "adjustment") custOutstanding[cid] += amt;
          else if (t === "payment" || t === "refund") custOutstanding[cid] -= amt;
        }

        // Oldest unpaid sale per customer
        const oldestDueSalesRes = await supabase
          .from("sales")
          .select("customer_id, sale_date")
          .eq("dealer_id", dealerId)
          .gt("due_amount", 0)
          .order("sale_date", { ascending: true });

        const oldestDueDate: Record<string, string> = {};
        for (const row of oldestDueSalesRes.data ?? []) {
          if (!oldestDueDate[row.customer_id]) {
            oldestDueDate[row.customer_id] = row.sale_date;
          }
        }

        for (const c of customers) {
          const outstanding = Math.max(0, custOutstanding[c.id] ?? 0);
          const creditLimit = Number(c.credit_limit) || 0;
          const maxOverdueDays = Number(c.max_overdue_days) || 0;

          if (creditLimit > 0 && outstanding > creditLimit) {
            creditExceededCount++;
          }

          if (maxOverdueDays > 0 && oldestDueDate[c.id]) {
            const daysDiff = Math.floor(
              (Date.now() - new Date(oldestDueDate[c.id]).getTime()) / 86_400_000
            );
            if (daysDiff > maxOverdueDays) overdueCustomerCount++;
          }
        }
      }

      // --- Monthly chart ---
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

      // --- Category sales ---
      const catMap: Record<string, number> = {};
      for (const item of categorySalesRes.data ?? []) {
        const cat = (item as any).products?.category ?? "other";
        catMap[cat] = (catMap[cat] || 0) + (Number(item.total) || 0);
      }
      const categorySales = Object.entries(catMap).map(([category, amount]) => ({
        category: category.charAt(0).toUpperCase() + category.slice(1),
        amount: round2(amount),
      }));

      // --- Top Customers ---
      const custSalesMap: Record<string, { name: string; amount: number }> = {};
      for (const row of topCustomersRes.data ?? []) {
        const name = (row as any).customers?.name ?? "Unknown";
        const cid = row.customer_id;
        if (!custSalesMap[cid]) custSalesMap[cid] = { name, amount: 0 };
        custSalesMap[cid].amount += Number(row.total_amount) || 0;
      }
      const topCustomers = Object.values(custSalesMap)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10)
        .map((c) => ({ name: c.name, amount: round2(c.amount) }));

      // --- Product Performance ---
      const prodMap: Record<string, { name: string; amount: number }> = {};
      for (const item of productPerfRes.data ?? []) {
        const name = (item as any).products?.name ?? "Unknown";
        if (!prodMap[name]) prodMap[name] = { name, amount: 0 };
        prodMap[name].amount += Number(item.total) || 0;
      }
      const productPerformance = Object.values(prodMap)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8)
        .map((p) => ({ name: p.name, amount: round2(p.amount) }));

      return {
        todaySales: round2(todaySales),
        todayCollection: round2(todayCollection),
        todayProfit: round2(todayProfit),
        todaySftSold: round2(todaySftSold),
        monthlySales: round2(monthlySales),
        monthlyCollection: round2(monthlyCollection),
        monthlyProfit: round2(monthlyProfit),
        monthlyPurchase: round2(monthlyPurchase),
        totalCustomerDue: round2(totalCustomerDue),
        totalSupplierPayable: round2(totalSupplierPayable),
        cashInHand: round2(cashInHand),
        totalStockValue: round2(totalStockValue),
        lowStockItems,
        overdueCustomerCount,
        creditExceededCount,
        deadStockCount,
        monthlySalesChart,
        categorySales,
        topCustomers,
        productPerformance,
      };
    } catch (err) {
      console.error("[dashboardService] getData failed, returning defaults:", err);
      return SAFE_DEFAULTS;
    }
  },
};
