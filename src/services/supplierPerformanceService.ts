/**
 * Supplier Performance Service — VPS-only (Phase 3U-15).
 * All endpoints already existed on backend; this just removes the Supabase fallback.
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export type ReliabilityBand = "reliable" | "average" | "at_risk" | "inactive";
export type PriceTrend = "stable" | "rising" | "falling" | "insufficient_data";

export interface SupplierPerformance {
  supplier_id: string;
  supplier_name: string;
  status: string;
  total_purchases: number;
  total_purchase_value: number;
  avg_purchase_value: number;
  last_purchase_date: string | null;
  days_since_last_purchase: number | null;
  avg_days_between_purchases: number | null;
  last_gap_days: number | null;
  longest_gap_days: number | null;
  on_time_count: number;
  delayed_count: number;
  delayed_pct: number;
  total_returns: number;
  total_return_value: number;
  return_rate_pct: number;
  outstanding_amount: number;
  recent_purchase_value_30d: number;
  price_trend: PriceTrend;
  price_change_pct: number;
  trend_products_compared: number;
  reliability_score: number;
  reliability_band: ReliabilityBand;
  score_factors: string[];
}

interface ListOptions {
  startDate?: string;
  endDate?: string;
}

async function vpsGet<T>(path: string): Promise<T> {
  const res = await vpsAuthedFetch(path);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((body as any)?.error || `Request failed (${res.status})`);
  return body as T;
}

export const supplierPerformanceService = {
  async list(dealerId: string, opts: ListOptions = {}): Promise<SupplierPerformance[]> {
    const params = new URLSearchParams({ dealerId });
    if (opts.startDate) params.set("startDate", opts.startDate);
    if (opts.endDate) params.set("endDate", opts.endDate);
    return vpsGet<SupplierPerformance[]>(`/api/reports/supplier-performance?${params}`);
  },

  async getForSupplier(dealerId: string, supplierId: string): Promise<SupplierPerformance | null> {
    return vpsGet<SupplierPerformance | null>(
      `/api/reports/supplier-performance/${encodeURIComponent(supplierId)}?dealerId=${encodeURIComponent(dealerId)}`,
    );
  },

  async getPriceTrendDetail(dealerId: string, supplierId: string) {
    return vpsGet<any>(
      `/api/reports/supplier-performance/${encodeURIComponent(supplierId)}/price-trend?dealerId=${encodeURIComponent(dealerId)}`,
    );
  },

  async getDashboardStats(dealerId: string) {
    return vpsGet<any>(
      `/api/reports/supplier-performance/dashboard?dealerId=${encodeURIComponent(dealerId)}`,
    );
  },
};
