/**
 * Project Report Service — VPS-only (Phase 3U-26).
 *
 * All 7 reports already had VPS endpoints behind the USE_VPS flag.
 * Since AUTH_BACKEND is forced to "vps" on every production / preview host
 * (sanitileserp.com, lovable.app, lovableproject.com — see src/lib/env.ts),
 * the legacy Supabase fallback branches were dead code. This file now keeps
 * only the VPS path.
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

async function vpsGet<T>(path: string): Promise<T> {
  const res = await vpsAuthedFetch(path);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((body as any)?.error || `Request failed (${res.status})`);
  return body as T;
}

// ── Types ───────────────────────────────────────────────────────────
export interface SalesByProjectRow {
  project_id: string;
  project_name: string;
  project_code: string;
  customer_name: string;
  invoice_count: number;
  total_sales: number;
  outstanding: number;
}

export interface OutstandingByProjectRow {
  project_id: string;
  project_name: string;
  project_code: string;
  customer_name: string;
  billed: number;
  paid: number;
  due: number;
  overdue: number;
}

export interface DeliveryHistoryBySiteRow {
  site_id: string;
  site_name: string;
  site_address: string | null;
  project_name: string;
  project_code: string;
  project_id: string;
  customer_name: string;
  challan_count: number;
  delivery_count: number;
  pending_deliveries: number;
  latest_delivery_date: string | null;
}

export interface ProjectQuotationPipelineRow {
  project_id: string;
  project_name: string;
  project_code: string;
  customer_name: string;
  quote_count: number;
  active_value: number;
  converted_value: number;
  expired_lost_value: number;
}

export interface TopActiveProjectRow {
  project_id: string;
  project_name: string;
  project_code: string;
  customer_name: string;
  activity_count: number;
  total_value: number;
}

export interface SiteRecentActivityRow {
  site_id: string;
  site_name: string;
  project_id: string;
  project_name: string;
  latest_date: string;
  kind: "sale" | "challan" | "delivery";
}

export interface ProjectDashboardStats {
  activeProjectsCount: number;
  pendingDeliveriesBySite: { site_id: string; site_name: string; project_name: string; pending_count: number }[];
  totalProjectOutstanding: number;
  topActive: TopActiveProjectRow[];
  recentSiteActivity: SiteRecentActivityRow[];
}

const enc = encodeURIComponent;

export const projectReportService = {
  salesByProject(dealerId: string) {
    return vpsGet<SalesByProjectRow[]>(`/api/reports/projects/sales?dealerId=${enc(dealerId)}`);
  },

  outstandingByProject(dealerId: string) {
    return vpsGet<OutstandingByProjectRow[]>(`/api/reports/projects/outstanding?dealerId=${enc(dealerId)}`);
  },

  deliveryHistoryBySite(dealerId: string) {
    return vpsGet<DeliveryHistoryBySiteRow[]>(`/api/reports/projects/delivery-history?dealerId=${enc(dealerId)}`);
  },

  quotationPipeline(dealerId: string) {
    return vpsGet<ProjectQuotationPipelineRow[]>(`/api/reports/projects/quotation-pipeline?dealerId=${enc(dealerId)}`);
  },

  topActiveProjects(dealerId: string, limit = 10) {
    return vpsGet<TopActiveProjectRow[]>(`/api/reports/projects/top-active?dealerId=${enc(dealerId)}&limit=${limit}`);
  },

  siteSummary(dealerId: string, siteId: string) {
    return vpsGet<any>(`/api/reports/projects/site-summary?dealerId=${enc(dealerId)}&siteId=${enc(siteId)}`);
  },

  siteHistory(dealerId: string, siteId: string) {
    return vpsGet<any>(`/api/reports/projects/site-history?dealerId=${enc(dealerId)}&siteId=${enc(siteId)}`);
  },

  dashboardStats(dealerId: string) {
    return vpsGet<ProjectDashboardStats>(`/api/reports/projects/dashboard?dealerId=${enc(dealerId)}`);
  },
};
