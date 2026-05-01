import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

async function vpsGet<T>(path: string): Promise<T> {
  const res = await vpsAuthedFetch(path);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((body as any)?.error || `Request failed (${res.status})`);
  return body as T;
}

export interface TierListRow {
  tier_id: string;
  tier_name: string;
  status: "active" | "inactive";
  is_default: boolean;
  product_count: number;
  customer_count: number;
}

export interface CustomerTierRow {
  customer_id: string;
  customer_name: string;
  customer_type: string;
  tier_id: string | null;
  tier_name: string | null;
  total_sales: number;
  total_quoted: number;
}

export interface SalesByTierRow {
  tier_id: string | null;
  tier_name: string;
  invoice_count: number;
  total_sales: number;
  avg_ticket: number;
}

export interface QuotedValueByTierRow {
  tier_id: string | null;
  tier_name: string;
  quote_count: number;
  total_quoted: number;
  converted_value: number;
}

export interface ManualOverrideRow {
  user_id: string | null;
  user_name: string;
  customer_id: string | null;
  customer_name: string;
  product_id: string;
  product_name: string;
  override_count: number;
  total_impact: number;
}

export const pricingTierReportService = {
  async tierList(dealerId: string): Promise<TierListRow[]> {
    return vpsGet<TierListRow[]>(`/api/reports/pricing-tier/tiers?dealerId=${encodeURIComponent(dealerId)}`);
  },

  async customersByTier(dealerId: string): Promise<CustomerTierRow[]> {
    return vpsGet<CustomerTierRow[]>(`/api/reports/pricing-tier/customers?dealerId=${encodeURIComponent(dealerId)}`);
  },

  async salesByTier(dealerId: string, fromDate?: string, toDate?: string): Promise<SalesByTierRow[]> {
    const params = new URLSearchParams({ dealerId });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return vpsGet<SalesByTierRow[]>(`/api/reports/pricing-tier/sales?${params}`);
  },

  async quotedValueByTier(dealerId: string, fromDate?: string, toDate?: string): Promise<QuotedValueByTierRow[]> {
    const params = new URLSearchParams({ dealerId });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return vpsGet<QuotedValueByTierRow[]>(`/api/reports/pricing-tier/quoted?${params}`);
  },

  async manualOverrides(
    dealerId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<ManualOverrideRow[]> {
    const params = new URLSearchParams({ dealerId });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return vpsGet<ManualOverrideRow[]>(`/api/reports/pricing-tier/manual-overrides?${params}`);
  },

  async dashboardStats(dealerId: string): Promise<{
    salesByTier: SalesByTierRow[];
    overrideCount7d: number;
    overrideCount30d: number;
    overrideImpact30d: number;
    customersWithoutTier: number;
  }> {
    return vpsGet<any>(`/api/reports/pricing-tier/dashboard?dealerId=${encodeURIComponent(dealerId)}`);
  },
};
