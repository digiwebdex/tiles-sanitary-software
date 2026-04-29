import { supabase } from "@/integrations/supabase/client";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

const USE_VPS = env.AUTH_BACKEND === "vps";

async function vpsGet<T>(path: string): Promise<T> {
  const res = await vpsAuthedFetch(path);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((body as any)?.error || `Request failed (${res.status})`);
  return body as T;
}

/**
 * Read-only aggregations for the Pricing Tier reports & dashboard widgets.
 * All queries are dealer-scoped through RLS + explicit eq("dealer_id", ...).
 */

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
    if (USE_VPS) return vpsGet<TierListRow[]>(`/api/reports/pricing-tier/tiers?dealerId=${encodeURIComponent(dealerId)}`);
    const [tiersRes, itemsRes, custRes] = await Promise.all([
      supabase.from("price_tiers").select("id, name, status, is_default").eq("dealer_id", dealerId).order("name"),
      supabase.from("price_tier_items").select("tier_id").eq("dealer_id", dealerId),
      supabase.from("customers").select("price_tier_id").eq("dealer_id", dealerId).not("price_tier_id", "is", null),
    ]);
    if (tiersRes.error) throw new Error(tiersRes.error.message);

    const productCountByTier = new Map<string, number>();
    for (const it of itemsRes.data ?? []) {
      productCountByTier.set(it.tier_id, (productCountByTier.get(it.tier_id) ?? 0) + 1);
    }
    const customerCountByTier = new Map<string, number>();
    for (const c of custRes.data ?? []) {
      if (c.price_tier_id) {
        customerCountByTier.set(c.price_tier_id, (customerCountByTier.get(c.price_tier_id) ?? 0) + 1);
      }
    }
    return (tiersRes.data ?? []).map((t) => ({
      tier_id: t.id,
      tier_name: t.name,
      status: t.status as "active" | "inactive",
      is_default: t.is_default,
      product_count: productCountByTier.get(t.id) ?? 0,
      customer_count: customerCountByTier.get(t.id) ?? 0,
    }));
  },

  async customersByTier(dealerId: string): Promise<CustomerTierRow[]> {
    if (USE_VPS) return vpsGet<CustomerTierRow[]>(`/api/reports/pricing-tier/customers?dealerId=${encodeURIComponent(dealerId)}`);
    const { data: customers, error } = await supabase
      .from("customers")
      .select("id, name, type, price_tier_id, price_tiers(name)")
      .eq("dealer_id", dealerId)
      .order("name");
    if (error) throw new Error(error.message);

    const ids = (customers ?? []).map((c) => c.id);
    if (ids.length === 0) return [];

    const [salesRes, quotesRes] = await Promise.all([
      supabase.from("sales").select("customer_id, total_amount").eq("dealer_id", dealerId).in("customer_id", ids),
      supabase.from("quotations").select("customer_id, total_amount").eq("dealer_id", dealerId).in("customer_id", ids).neq("status", "cancelled"),
    ]);

    const salesByCust = new Map<string, number>();
    for (const r of salesRes.data ?? []) {
      salesByCust.set(r.customer_id, (salesByCust.get(r.customer_id) ?? 0) + Number(r.total_amount ?? 0));
    }
    const quotedByCust = new Map<string, number>();
    for (const r of quotesRes.data ?? []) {
      if (!r.customer_id) continue;
      quotedByCust.set(r.customer_id, (quotedByCust.get(r.customer_id) ?? 0) + Number(r.total_amount ?? 0));
    }

    return (customers ?? []).map((c) => ({
      customer_id: c.id,
      customer_name: c.name,
      customer_type: c.type,
      tier_id: c.price_tier_id,
      tier_name: (c.price_tiers as { name: string } | null)?.name ?? null,
      total_sales: Math.round((salesByCust.get(c.id) ?? 0) * 100) / 100,
      total_quoted: Math.round((quotedByCust.get(c.id) ?? 0) * 100) / 100,
    }));
  },

  async salesByTier(dealerId: string, fromDate?: string, toDate?: string): Promise<SalesByTierRow[]> {
    if (USE_VPS) {
      const params = new URLSearchParams({ dealerId });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      return vpsGet<SalesByTierRow[]>(`/api/reports/pricing-tier/sales?${params}`);
    }
    let q = supabase
      .from("sale_items")
      .select("tier_id, total, sale_id, price_tiers(name), sales!inner(sale_date)")
      .eq("dealer_id", dealerId);
    if (fromDate) q = q.gte("sales.sale_date", fromDate);
    if (toDate) q = q.lte("sales.sale_date", toDate);
    const { data, error } = await q.limit(50000);
    if (error) throw new Error(error.message);

    const map = new Map<string, { name: string; sales: number; saleIds: Set<string> }>();
    for (const r of data ?? []) {
      const key = (r.tier_id as string | null) ?? "__none";
      const name = key === "__none" ? "No Tier (Default)" : ((r.price_tiers as { name: string } | null)?.name ?? "Unknown");
      const cur = map.get(key) ?? { name, sales: 0, saleIds: new Set<string>() };
      cur.sales += Number(r.total ?? 0);
      cur.saleIds.add(r.sale_id);
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([k, v]) => ({
        tier_id: k === "__none" ? null : k,
        tier_name: v.name,
        invoice_count: v.saleIds.size,
        total_sales: Math.round(v.sales * 100) / 100,
        avg_ticket: v.saleIds.size > 0 ? Math.round((v.sales / v.saleIds.size) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.total_sales - a.total_sales);
  },

  async quotedValueByTier(dealerId: string, fromDate?: string, toDate?: string): Promise<QuotedValueByTierRow[]> {
    if (USE_VPS) {
      const params = new URLSearchParams({ dealerId });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      return vpsGet<QuotedValueByTierRow[]>(`/api/reports/pricing-tier/quoted?${params}`);
    }
    let q = supabase
      .from("quotation_items")
      .select("tier_id, line_total, quotation_id, price_tiers(name), quotations!inner(quote_date, status, converted_sale_id)")
      .eq("dealer_id", dealerId);
    if (fromDate) q = q.gte("quotations.quote_date", fromDate);
    if (toDate) q = q.lte("quotations.quote_date", toDate);
    const { data, error } = await q.limit(50000);
    if (error) throw new Error(error.message);

    const map = new Map<string, { name: string; quoted: number; converted: number; quoteIds: Set<string> }>();
    for (const r of data ?? []) {
      const key = (r.tier_id as string | null) ?? "__none";
      const name = key === "__none" ? "No Tier (Default)" : ((r.price_tiers as { name: string } | null)?.name ?? "Unknown");
      const cur = map.get(key) ?? { name, quoted: 0, converted: 0, quoteIds: new Set<string>() };
      cur.quoted += Number(r.line_total ?? 0);
      const status = (r.quotations as { status?: string } | null)?.status;
      if (status === "converted") cur.converted += Number(r.line_total ?? 0);
      cur.quoteIds.add(r.quotation_id);
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([k, v]) => ({
        tier_id: k === "__none" ? null : k,
        tier_name: v.name,
        quote_count: v.quoteIds.size,
        total_quoted: Math.round(v.quoted * 100) / 100,
        converted_value: Math.round(v.converted * 100) / 100,
      }))
      .sort((a, b) => b.total_quoted - a.total_quoted);
  },

  async manualOverrides(
    dealerId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<ManualOverrideRow[]> {
    if (USE_VPS) {
      const params = new URLSearchParams({ dealerId });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      return vpsGet<ManualOverrideRow[]>(`/api/reports/pricing-tier/manual-overrides?${params}`);
    }
    let q = supabase
      .from("sale_items")
      .select(
        "product_id, sale_rate, original_resolved_rate, quantity, products(name), sales!inner(sale_date, customer_id, created_by, customers(name), profiles:created_by(name))",
      )
      .eq("dealer_id", dealerId)
      .eq("rate_source", "manual");
    if (fromDate) q = q.gte("sales.sale_date", fromDate);
    if (toDate) q = q.lte("sales.sale_date", toDate);
    const { data, error } = await q.limit(20000);
    if (error) throw new Error(error.message);

    const map = new Map<string, ManualOverrideRow>();
    for (const r of data ?? []) {
      const sale = r.sales as { customer_id?: string; created_by?: string; customers?: { name?: string }; profiles?: { name?: string } } | null;
      const userId = sale?.created_by ?? null;
      const userName = sale?.profiles?.name ?? "Unknown user";
      const customerId = sale?.customer_id ?? null;
      const customerName = sale?.customers?.name ?? "Walk-in";
      const productName = (r.products as { name?: string } | null)?.name ?? "Unknown";
      const key = `${userId ?? "_"}|${customerId ?? "_"}|${r.product_id}`;
      const orig = Number(r.original_resolved_rate ?? r.sale_rate ?? 0);
      const final = Number(r.sale_rate ?? 0);
      const impact = (final - orig) * Number(r.quantity ?? 0);
      const cur = map.get(key) ?? {
        user_id: userId,
        user_name: userName,
        customer_id: customerId,
        customer_name: customerName,
        product_id: r.product_id,
        product_name: productName,
        override_count: 0,
        total_impact: 0,
      };
      cur.override_count += 1;
      cur.total_impact += impact;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, total_impact: Math.round(r.total_impact * 100) / 100 }))
      .sort((a, b) => b.override_count - a.override_count);
  },

  /** Lightweight stats used by dashboard widgets. */
  async dashboardStats(dealerId: string): Promise<{
    salesByTier: SalesByTierRow[];
    overrideCount7d: number;
    overrideCount30d: number;
    overrideImpact30d: number;
    customersWithoutTier: number;
  }> {
    const today = new Date();
    const d7 = new Date(today.getTime() - 7 * 86400000).toISOString().split("T")[0];
    const d30 = new Date(today.getTime() - 30 * 86400000).toISOString().split("T")[0];

    const [salesByTierRes, overrides30Res, customerRes] = await Promise.all([
      this.salesByTier(dealerId, d30, today.toISOString().split("T")[0]),
      supabase
        .from("sale_items")
        .select("sale_rate, original_resolved_rate, quantity, sales!inner(sale_date)")
        .eq("dealer_id", dealerId)
        .eq("rate_source", "manual")
        .gte("sales.sale_date", d30),
      supabase.from("customers").select("id, price_tier_id").eq("dealer_id", dealerId).eq("status", "active"),
    ]);

    let count7 = 0;
    let count30 = 0;
    let impact30 = 0;
    for (const r of (overrides30Res.data ?? []) as Array<{ sale_rate: number; original_resolved_rate: number | null; quantity: number; sales: { sale_date: string } }>) {
      count30 += 1;
      const date = r.sales?.sale_date ?? "";
      if (date >= d7) count7 += 1;
      const orig = Number(r.original_resolved_rate ?? r.sale_rate ?? 0);
      const final = Number(r.sale_rate ?? 0);
      impact30 += (final - orig) * Number(r.quantity ?? 0);
    }

    const customersWithoutTier = (customerRes.data ?? []).filter((c) => !c.price_tier_id).length;

    return {
      salesByTier: salesByTierRes,
      overrideCount7d: count7,
      overrideCount30d: count30,
      overrideImpact30d: Math.round(impact30 * 100) / 100,
      customersWithoutTier,
    };
  },
};
