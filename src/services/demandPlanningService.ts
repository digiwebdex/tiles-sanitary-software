/**
 * Demand Planning service — VPS-backed (Phase 3U-16).
 *
 * Heavy aggregations now run server-side (/api/demand-planning/*).
 * Client retains pure helpers (groupBy, filter, formatting).
 *
 * READ-ONLY. No stock or ledger side effects.
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { DEMAND_PLANNING_DEFAULTS } from "@/services/demandPlanningSettingsService";

export type DemandFlag =
  | "stockout_risk"
  | "low_stock"
  | "reorder_suggested"
  | "fast_moving"
  | "slow_moving"
  | "dead_stock"
  | "ok";

export type CoverageStatus = "uncovered" | "partial" | "covered" | "no_need";

export interface DemandRow {
  product_id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string;
  size: string | null;
  unit_type: string;
  reorder_level: number;
  total_stock: number;
  reserved_stock: number;
  free_stock: number;
  safety_stock: number;
  open_shortage: number;
  incoming_qty: number;
  uncovered_gap: number;
  coverage_status: CoverageStatus;
  coverage_ratio: number | null;
  sold_30d: number;
  sold_60d: number;
  sold_90d: number;
  velocity_per_day: number;
  velocity_trend: "rising" | "steady" | "falling" | "flat";
  days_of_cover: number | null;
  last_sale_date: string | null;
  days_since_last_sale: number | null;
  suggested_reorder_qty: number;
  flags: DemandFlag[];
  primary_flag: DemandFlag;
  flag_reasons: string[];
}

export interface DemandStats {
  reorderNeededCount: number;
  lowStockCount: number;
  stockoutRiskCount: number;
  deadStockCount: number;
  deadStockValue: number;
  fastMovingCount: number;
  slowMovingCount: number;
  incomingCoverageProductCount: number;
  uncoveredGapCount: number;
  topCategoriesAtRisk: Array<{ key: string; count: number }>;
  topBrandsAtRisk: Array<{ key: string; count: number }>;
  topWaitingProjects: Array<{
    project_id: string;
    project_name: string;
    open_shortage: number;
    days_waiting: number;
  }>;
}

export interface DemandGroupRow {
  key: string;
  product_count: number;
  reorder_count: number;
  stockout_count: number;
  low_stock_count: number;
  dead_count: number;
  fast_count: number;
  slow_count: number;
  free_stock_total: number;
  incoming_total: number;
  open_shortage_total: number;
  uncovered_gap_total: number;
}

export interface ProjectDemandRow {
  project_id: string;
  project_name: string;
  site_id: string | null;
  site_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  product_count: number;
  open_shortage_total: number;
  incoming_total: number;
  uncovered_gap: number;
  oldest_shortage_date: string | null;
  days_waiting: number | null;
}

async function call<T>(path: string): Promise<T> {
  const res = await vpsAuthedFetch(path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try { msg = JSON.parse(text).error ?? text; } catch { /* ignore */ }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

function groupBy(
  rows: DemandRow[],
  picker: (r: DemandRow) => string | null,
): DemandGroupRow[] {
  const map = new Map<string, DemandGroupRow>();
  for (const r of rows) {
    const key = (picker(r) ?? "—").trim() || "—";
    const cur = map.get(key) ?? {
      key, product_count: 0, reorder_count: 0, stockout_count: 0, low_stock_count: 0,
      dead_count: 0, fast_count: 0, slow_count: 0,
      free_stock_total: 0, incoming_total: 0, open_shortage_total: 0, uncovered_gap_total: 0,
    };
    cur.product_count++;
    if (r.flags.includes("reorder_suggested")) cur.reorder_count++;
    if (r.flags.includes("stockout_risk")) cur.stockout_count++;
    if (r.flags.includes("low_stock")) cur.low_stock_count++;
    if (r.flags.includes("dead_stock")) cur.dead_count++;
    if (r.flags.includes("fast_moving")) cur.fast_count++;
    if (r.flags.includes("slow_moving")) cur.slow_count++;
    cur.free_stock_total += r.free_stock;
    cur.incoming_total += r.incoming_qty;
    cur.open_shortage_total += r.open_shortage;
    cur.uncovered_gap_total += r.uncovered_gap;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) =>
    (b.reorder_count + b.stockout_count + b.dead_count) -
    (a.reorder_count + a.stockout_count + a.dead_count),
  );
}

export const demandPlanningService = {
  async getDemandRows(dealerId: string): Promise<DemandRow[]> {
    const r = await call<{ rows: DemandRow[] }>(
      `/api/demand-planning/rows?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return r.rows ?? [];
  },

  async getDashboardStats(dealerId: string): Promise<DemandStats> {
    const r = await call<{ data: DemandStats }>(
      `/api/demand-planning/dashboard-stats?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return r.data;
  },

  async getProjectDemandRows(dealerId: string): Promise<ProjectDemandRow[]> {
    const r = await call<{ rows: ProjectDemandRow[] }>(
      `/api/demand-planning/project-rows?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return r.rows ?? [];
  },

  filter(rows: DemandRow[], flag: DemandFlag): DemandRow[] {
    return rows.filter((r) => r.flags.includes(flag));
  },
  groupByCategory(rows: DemandRow[]): DemandGroupRow[] {
    return groupBy(rows, (r) => r.category);
  },
  groupByBrand(rows: DemandRow[]): DemandGroupRow[] {
    return groupBy(rows, (r) => r.brand);
  },
  groupBySize(rows: DemandRow[]): DemandGroupRow[] {
    return groupBy(rows, (r) => r.size);
  },
};

// Backward-compat constants (defaults).
export const DEMAND_THRESHOLDS = {
  VELOCITY_WINDOW_SHORT: DEMAND_PLANNING_DEFAULTS.velocity_window_days,
  VELOCITY_WINDOW_LONG: 90,
  STOCKOUT_COVER_DAYS: DEMAND_PLANNING_DEFAULTS.stockout_cover_days,
  REORDER_COVER_DAYS: DEMAND_PLANNING_DEFAULTS.reorder_cover_days,
  TARGET_COVER_DAYS: DEMAND_PLANNING_DEFAULTS.target_cover_days,
  FAST_MOVING_30D_QTY: DEMAND_PLANNING_DEFAULTS.fast_moving_30d_qty,
  SLOW_MOVING_30D_MAX: DEMAND_PLANNING_DEFAULTS.slow_moving_30d_max,
  DEAD_STOCK_DAYS: DEMAND_PLANNING_DEFAULTS.dead_stock_days,
  INCOMING_WINDOW: DEMAND_PLANNING_DEFAULTS.incoming_window_days,
} as const;
