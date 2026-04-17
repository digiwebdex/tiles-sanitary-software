import { supabase } from "@/integrations/supabase/client";
import {
  demandPlanningSettingsService,
  DEMAND_PLANNING_DEFAULTS,
  type DemandPlanningSettings,
} from "@/services/demandPlanningSettingsService";

/**
 * Demand Planning / Reorder Intelligence — Batch 2 (settings-aware + grouping)
 *
 * No new schema for derivation; thresholds come from `demand_planning_settings`
 * (dealer-scoped, dealer_admin only) with safe defaults if no row exists.
 *
 * Definitions (kept simple and explainable):
 *   total_stock         = box_qty + piece_qty            (free + held; everything physically here)
 *   reserved_stock      = Σ batch.reserved_*              (held by active reservations)
 *   free_stock          = max(0, total_stock - reserved)  (sellable right now)
 *   open_shortage       = Σ max(0, sale_item.backorder_qty - allocated_qty)
 *   incoming_qty        = Σ purchase_item.quantity for purchases in last incoming_window days
 *   velocity_per_day    = sold_qty in velocity_window / velocity_window
 *   safety_stock        = ceil(velocity_per_day * safety_stock_days)   (advisory cushion)
 *   days_of_cover       = max(0, free_stock - safety_stock) / velocity_per_day  (∞ when v=0)
 *   uncovered_gap       = max(0, open_shortage + safety_stock + (reorder_level - free_stock) - incoming)
 *
 * Classification (all gated by settings):
 *   stockout_risk       = velocity > 0 AND (free <= safety OR cover < stockout_cover_days)
 *   low_stock           = velocity > 0 AND free <= reorder_level + safety
 *   reorder_suggested   = velocity > 0 AND (free <= reorder_level + safety OR cover < reorder_cover_days)
 *   fast_moving         = sold_30d >= fast_moving_30d_qty
 *   slow_moving         = sold_90d > 0 AND sold_30d < slow_moving_30d_max
 *   dead_stock          = no sales in last dead_stock_days AND total_stock > 0
 *
 * Reorder qty suggestion:
 *   suggested = max(reorder_level * 2 - free,
 *                   ceil(velocity * target_cover_days) + safety - free + open_shortage)
 *
 * READ-ONLY. No stock side effect. No ledger entry. Advisory only.
 */

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
  /** Owner-friendly reasons explaining why each non-OK flag fired. */
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

interface ProductLite {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string;
  size: string | null;
  unit_type: string;
  reorder_level: number;
  cost_price: number;
}

const today = () => new Date();
const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};
const daysBetween = (iso: string | null) => {
  if (!iso) return null;
  const ms = today().getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
};

function pickPrimaryFlag(flags: DemandFlag[]): DemandFlag {
  const order: DemandFlag[] = [
    "stockout_risk",
    "dead_stock",
    "low_stock",
    "reorder_suggested",
    "slow_moving",
    "fast_moving",
    "ok",
  ];
  for (const f of order) if (flags.includes(f)) return f;
  return "ok";
}

async function loadProducts(dealerId: string): Promise<ProductLite[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, sku, name, brand, category, size, unit_type, reorder_level, cost_price")
    .eq("dealer_id", dealerId)
    .eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand ?? null,
    category: String(p.category),
    size: (p as { size?: string | null }).size ?? null,
    unit_type: String(p.unit_type),
    reorder_level: Number(p.reorder_level ?? 0),
    cost_price: Number(p.cost_price ?? 0),
  }));
}

async function loadStockMap(dealerId: string, ids: string[]) {
  if (!ids.length) return new Map<string, { total: number }>();
  const { data } = await supabase
    .from("stock")
    .select("product_id, box_qty, piece_qty")
    .eq("dealer_id", dealerId)
    .in("product_id", ids);
  return new Map(
    (data ?? []).map((s) => [
      s.product_id,
      { total: Number(s.box_qty ?? 0) + Number(s.piece_qty ?? 0) },
    ]),
  );
}

async function loadReservedMap(dealerId: string, ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const { data } = await supabase
    .from("product_batches")
    .select("product_id, reserved_box_qty, reserved_piece_qty")
    .eq("dealer_id", dealerId)
    .in("product_id", ids);
  const m = new Map<string, number>();
  for (const b of data ?? []) {
    const r = Number(b.reserved_box_qty ?? 0) + Number(b.reserved_piece_qty ?? 0);
    m.set(b.product_id, (m.get(b.product_id) ?? 0) + r);
  }
  return m;
}

async function loadShortageMap(dealerId: string, ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const { data } = await supabase
    .from("sale_items")
    .select("product_id, backorder_qty, allocated_qty")
    .eq("dealer_id", dealerId)
    .in("product_id", ids)
    .gt("backorder_qty", 0);
  const m = new Map<string, number>();
  for (const r of data ?? []) {
    const open = Math.max(
      0,
      Number(r.backorder_qty ?? 0) - Number(r.allocated_qty ?? 0),
    );
    if (open > 0) m.set(r.product_id, (m.get(r.product_id) ?? 0) + open);
  }
  return m;
}

interface SalesAgg { sold30: number; sold60: number; sold90: number; lastSale: string | null }

async function loadSalesMap(dealerId: string, ids: string[], settings: DemandPlanningSettings) {
  const m = new Map<string, SalesAgg>();
  if (!ids.length) return m;
  const longWindow = Math.max(settings.dead_stock_days, 90);
  const sinceLong = isoDaysAgo(longWindow);

  const { data, error } = await supabase
    .from("sale_items")
    .select("product_id, quantity, sales!inner(created_at, dealer_id)")
    .eq("dealer_id", dealerId)
    .in("product_id", ids)
    .gte("sales.created_at", sinceLong);
  if (error) return m;

  const now = today().getTime();
  const cutoffShort = now - settings.velocity_window_days * 86_400_000;
  const cutoff60 = now - 60 * 86_400_000;
  for (const row of (data ?? []) as Array<{
    product_id: string;
    quantity: number | string;
    sales: { created_at: string } | null;
  }>) {
    const createdAt = row.sales?.created_at;
    if (!createdAt) continue;
    const ts = new Date(createdAt).getTime();
    const qty = Number(row.quantity ?? 0);
    const cur = m.get(row.product_id) ?? { sold30: 0, sold60: 0, sold90: 0, lastSale: null };
    cur.sold90 += qty;
    if (ts >= cutoff60) cur.sold60 += qty;
    if (ts >= cutoffShort) cur.sold30 += qty;
    if (!cur.lastSale || createdAt > cur.lastSale) cur.lastSale = createdAt;
    m.set(row.product_id, cur);
  }

  const { data: lastRows } = await supabase
    .from("sale_items")
    .select("product_id, sales!inner(created_at, dealer_id)")
    .eq("dealer_id", dealerId)
    .in("product_id", ids)
    .order("created_at", { ascending: false, referencedTable: "sales" })
    .limit(2000);
  for (const row of (lastRows ?? []) as Array<{
    product_id: string;
    sales: { created_at: string } | null;
  }>) {
    const createdAt = row.sales?.created_at;
    if (!createdAt) continue;
    const cur = m.get(row.product_id);
    if (cur) {
      if (!cur.lastSale || createdAt > cur.lastSale) cur.lastSale = createdAt;
    } else {
      m.set(row.product_id, { sold30: 0, sold60: 0, sold90: 0, lastSale: createdAt });
    }
  }
  return m;
}

async function loadIncomingMap(dealerId: string, ids: string[], windowDays: number) {
  if (!ids.length) return new Map<string, number>();
  const since = isoDaysAgo(windowDays);
  const { data, error } = await supabase
    .from("purchase_items")
    .select("product_id, quantity, purchases!inner(purchase_date, dealer_id)")
    .eq("dealer_id", dealerId)
    .in("product_id", ids)
    .gte("purchases.purchase_date", since.slice(0, 10));
  if (error) return new Map<string, number>();
  const m = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ product_id: string; quantity: number | string }>) {
    m.set(row.product_id, (m.get(row.product_id) ?? 0) + Number(row.quantity ?? 0));
  }
  return m;
}

function classify(
  p: ProductLite,
  totalStock: number,
  reserved: number,
  shortage: number,
  incoming: number,
  sold30: number,
  sold60: number,
  sold90: number,
  lastSale: string | null,
  s: DemandPlanningSettings,
) {
  const free = Math.max(0, totalStock - reserved);
  const velocity = sold30 / s.velocity_window_days;
  const safety = Math.ceil(velocity * s.safety_stock_days);
  const sellable = Math.max(0, free - safety);
  const cover = velocity > 0 ? sellable / velocity : null;

  // Velocity trend: compare last 30 days vs prior 30 (sold60 - sold30).
  const prior30 = Math.max(0, sold60 - sold30);
  let velocity_trend: "rising" | "steady" | "falling" | "flat" = "flat";
  if (sold30 === 0 && prior30 === 0) {
    velocity_trend = "flat";
  } else if (prior30 === 0) {
    velocity_trend = sold30 > 0 ? "rising" : "flat";
  } else {
    const ratio = sold30 / prior30;
    if (ratio >= 1.25) velocity_trend = "rising";
    else if (ratio <= 0.75) velocity_trend = "falling";
    else velocity_trend = "steady";
  }

  const flags: DemandFlag[] = [];
  const reasons: string[] = [];

  if (velocity > 0 && (free <= safety || (cover !== null && cover < s.stockout_cover_days))) {
    flags.push("stockout_risk");
    reasons.push(
      cover !== null
        ? `Only ~${cover.toFixed(1)} days of cover at current velocity (target ≥ ${s.stockout_cover_days}d).`
        : `Free stock at or below safety cushion (${safety}).`,
    );
  }
  if (velocity > 0 && free <= p.reorder_level + safety) {
    flags.push("low_stock");
    reasons.push(`Free stock ${free} ≤ reorder level ${p.reorder_level} + safety ${safety}.`);
  }
  if (
    velocity > 0 &&
    (free <= p.reorder_level + safety || (cover !== null && cover < s.reorder_cover_days))
  ) {
    flags.push("reorder_suggested");
    reasons.push(
      cover !== null && cover < s.reorder_cover_days
        ? `Cover ${cover.toFixed(1)}d is below reorder threshold (${s.reorder_cover_days}d).`
        : `Free stock has reached the reorder line.`,
    );
  }
  if (sold30 >= s.fast_moving_30d_qty) {
    flags.push("fast_moving");
    reasons.push(`Sold ${sold30} units in last 30d (≥ ${s.fast_moving_30d_qty}).`);
  }
  if (sold90 > 0 && sold30 < s.slow_moving_30d_max) {
    flags.push("slow_moving");
    reasons.push(`Only ${sold30} sold in last 30d (threshold < ${s.slow_moving_30d_max}).`);
  }

  const daysSince = daysBetween(lastSale);
  if (totalStock > 0 && (daysSince === null || daysSince >= s.dead_stock_days) && sold90 === 0) {
    flags.push("dead_stock");
    reasons.push(
      daysSince === null
        ? `Stock on hand but no sale ever recorded.`
        : `${daysSince} days since last sale (dead after ${s.dead_stock_days}d).`,
    );
  }

  const targetQty = Math.ceil(velocity * s.target_cover_days) + safety;
  const fromTarget = Math.max(0, targetQty - free + shortage);
  const fromReorder = Math.max(0, p.reorder_level * 2 - free);
  const suggested = Math.max(fromTarget, fromReorder);

  // Coverage signal: how well does incoming cover what's needed?
  const need = shortage + Math.max(0, p.reorder_level + safety - free);
  let coverage_status: CoverageStatus;
  let coverage_ratio: number | null;
  if (need <= 0) {
    coverage_status = "no_need";
    coverage_ratio = null;
  } else if (incoming <= 0) {
    coverage_status = "uncovered";
    coverage_ratio = 0;
  } else if (incoming >= need) {
    coverage_status = "covered";
    coverage_ratio = 1;
  } else {
    coverage_status = "partial";
    coverage_ratio = Math.round((incoming / need) * 100) / 100;
  }
  const uncovered_gap = Math.max(0, need - incoming);

  return {
    flags: flags.length ? flags : ["ok" as DemandFlag],
    reasons,
    velocity, velocity_trend, cover, suggested, safety,
    coverage_status, coverage_ratio, uncovered_gap,
  };
}

async function getSettings(dealerId: string): Promise<DemandPlanningSettings> {
  try {
    return await demandPlanningSettingsService.get(dealerId);
  } catch {
    return { dealer_id: dealerId, ...DEMAND_PLANNING_DEFAULTS };
  }
}

async function getDemandRows(dealerId: string): Promise<DemandRow[]> {
  const settings = await getSettings(dealerId);
  const products = await loadProducts(dealerId);
  if (!products.length) return [];
  const ids = products.map((p) => p.id);

  const [stockMap, reservedMap, shortageMap, salesMap, incomingMap] = await Promise.all([
    loadStockMap(dealerId, ids),
    loadReservedMap(dealerId, ids),
    loadShortageMap(dealerId, ids),
    loadSalesMap(dealerId, ids, settings),
    loadIncomingMap(dealerId, ids, settings.incoming_window_days),
  ]);

  return products.map((p) => {
    const total = stockMap.get(p.id)?.total ?? 0;
    const reserved = reservedMap.get(p.id) ?? 0;
    const shortage = shortageMap.get(p.id) ?? 0;
    const incoming = incomingMap.get(p.id) ?? 0;
    const sales = salesMap.get(p.id) ?? { sold30: 0, sold60: 0, sold90: 0, lastSale: null };

    const c = classify(
      p, total, reserved, shortage, incoming,
      sales.sold30, sales.sold60, sales.sold90, sales.lastSale, settings,
    );

    return {
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      category: p.category,
      size: p.size,
      unit_type: p.unit_type,
      reorder_level: p.reorder_level,
      total_stock: total,
      reserved_stock: reserved,
      free_stock: Math.max(0, total - reserved),
      safety_stock: c.safety,
      open_shortage: shortage,
      incoming_qty: incoming,
      uncovered_gap: c.uncovered_gap,
      coverage_status: c.coverage_status,
      coverage_ratio: c.coverage_ratio,
      sold_30d: sales.sold30,
      sold_60d: sales.sold60,
      sold_90d: sales.sold90,
      velocity_per_day: Math.round(c.velocity * 100) / 100,
      velocity_trend: c.velocity_trend,
      days_of_cover: c.cover === null ? null : Math.round(c.cover * 10) / 10,
      last_sale_date: sales.lastSale,
      days_since_last_sale: daysBetween(sales.lastSale),
      suggested_reorder_qty: c.suggested,
      flags: c.flags,
      primary_flag: pickPrimaryFlag(c.flags),
      flag_reasons: c.reasons,
    };
  });
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

async function getDashboardStats(dealerId: string): Promise<DemandStats> {
  const rows = await getDemandRows(dealerId);
  const products = await loadProducts(dealerId);
  const costMap = new Map(products.map((p) => [p.id, p.cost_price]));

  let deadValue = 0;
  let reorder = 0, low = 0, risk = 0, dead = 0, fast = 0, slow = 0, incoming = 0, gap = 0;
  const byCategory = new Map<string, number>();
  const byBrand = new Map<string, number>();

  for (const r of rows) {
    if (r.flags.includes("reorder_suggested")) reorder++;
    if (r.flags.includes("low_stock")) low++;
    if (r.flags.includes("stockout_risk")) risk++;
    if (r.flags.includes("dead_stock")) {
      dead++;
      deadValue += r.total_stock * (costMap.get(r.product_id) ?? 0);
    }
    if (r.flags.includes("fast_moving")) fast++;
    if (r.flags.includes("slow_moving")) slow++;
    if (r.incoming_qty > 0) incoming++;
    if (r.uncovered_gap > 0) gap++;

    const isAtRisk =
      r.flags.includes("stockout_risk") ||
      r.flags.includes("low_stock") ||
      r.flags.includes("reorder_suggested");
    if (isAtRisk) {
      byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
      const b = (r.brand ?? "—").trim() || "—";
      byBrand.set(b, (byBrand.get(b) ?? 0) + 1);
    }
  }

  const topN = (m: Map<string, number>, n = 3) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, count]) => ({ key, count }));

  return {
    reorderNeededCount: reorder,
    lowStockCount: low,
    stockoutRiskCount: risk,
    deadStockCount: dead,
    deadStockValue: Math.round(deadValue * 100) / 100,
    fastMovingCount: fast,
    slowMovingCount: slow,
    incomingCoverageProductCount: incoming,
    uncoveredGapCount: gap,
    topCategoriesAtRisk: topN(byCategory),
    topBrandsAtRisk: topN(byBrand),
  };
}

export const demandPlanningService = {
  getDemandRows,
  getDashboardStats,
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

// Backward-compat constants (still exported for any consumer using DEMAND_THRESHOLDS).
// These now reflect the *defaults*; live values come from settings.
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
