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
    throw new Error((body as any)?.error || `Dashboard request failed (${res.status})`);
  }
  const body = (await res.json()) as Partial<DashboardData>;
  // Merge with defaults so any field the backend doesn't return yet stays safe.
  return { ...SAFE_DEFAULTS, ...body };
}

export const dashboardService = {
  async getData(dealerId: string): Promise<DashboardData> {
    if (!dealerId) return SAFE_DEFAULTS;
    try {
      return await getDataFromVps(dealerId);
    } catch (err) {
      console.error("[dashboardService] VPS load failed:", err);
      return SAFE_DEFAULTS;
    }
  },
};
