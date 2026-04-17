import { supabase } from "@/integrations/supabase/client";

/**
 * Demand Planning / Reorder Intelligence — Batch 1 (DERIVED ONLY)
 *
 * No schema changes. Pure read model built from existing tables:
 *   • products            – sku, name, brand, category, unit_type, reorder_level
 *   • stock               – box_qty + piece_qty (current free + sellable)
 *   • product_batches     – reserved_box_qty + reserved_piece_qty (held by reservations)
 *   • sale_items          – historical sales for velocity (joined to sales.created_at)
 *   • sale_items.backorder_qty - allocated_qty   – open shortages
 *   • purchase_items      – joined to purchases.purchase_date for incoming coverage signal
 *
 * Definitions (kept simple and explainable):
 *   total_stock         = box_qty + piece_qty            (free + held; everything physically here)
 *   reserved_stock      = Σ batch.reserved_*              (held by active reservations)
 *   free_stock          = max(0, total_stock - reserved)  (sellable right now)
 *   open_shortage       = Σ max(0, sale_item.backorder_qty - allocated_qty)
 *   incoming_30d        = Σ purchase_item.quantity for purchases in last 30 days
 *                         (advisory recent inflow signal — NOT a future ETA)
 *   velocity_per_day    = sold_qty in window / window_days (default 30d)
 *   days_of_cover       = free_stock / velocity_per_day   (∞ when velocity = 0)
 *
 * Classification thresholds (Batch 1 defaults — non-configurable, tunable later):
 *   stockout_risk       = free_stock <= 0 with positive velocity, OR days_of_cover < 7
 *   low_stock           = free_stock <= reorder_level and velocity > 0
 *   reorder_suggested   = days_of_cover < 14 OR free_stock <= reorder_level (with velocity > 0)
 *   fast_moving         = sold_qty in last 30d ≥ 20  (top movers)
 *   slow_moving         = sold_qty in last 90d > 0 AND sold_qty in last 30d < 5
 *   dead_stock          = no sales in last 90d AND total_stock > 0
 *
 * Reorder qty suggestion:
 *   target_cover_days = 30
 *   suggested = max(reorder_level * 2 - free_stock, ceil(velocity * target_cover_days) - free_stock + open_shortage)
 *   incoming_30d is shown alongside (not subtracted) so the buyer can decide.
 *
 * READ-ONLY. No stock side effect. No ledger entry. Advisory only.
 */

const VELOCITY_WINDOW_SHORT = 30; // days
const VELOCITY_WINDOW_LONG = 90;
const STOCKOUT_COVER_DAYS = 7;
const REORDER_COVER_DAYS = 14;
const TARGET_COVER_DAYS = 30;
const FAST_MOVING_30D_QTY = 20;
const SLOW_MOVING_30D_MAX = 5;
const DEAD_STOCK_DAYS = 90;
const INCOMING_WINDOW = 30;

export type DemandFlag =
  | "stockout_risk"
  | "low_stock"
  | "reorder_suggested"
  | "fast_moving"
  | "slow_moving"
  | "dead_stock"
  | "ok";

export interface DemandRow {
  product_id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string;
  unit_type: string;
  reorder_level: number;
  total_stock: number;
  reserved_stock: number;
  free_stock: number;
  open_shortage: number;
  incoming_30d: number;
  sold_30d: number;
  sold_90d: number;
  velocity_per_day: number;     // 30-day window
  days_of_cover: number | null; // null = infinite (no velocity)
  last_sale_date: string | null;
  days_since_last_sale: number | null;
  suggested_reorder_qty: number;
  flags: DemandFlag[];
  primary_flag: DemandFlag;
}

export interface DemandStats {
  reorderNeededCount: number;
  lowStockCount: number;
  stockoutRiskCount: number;
  deadStockCount: number;
  deadStockValue: number;       // FIFO-ish: total_stock × cost_price
  fastMovingCount: number;
  slowMovingCount: number;
  incomingCoverageProductCount: number; // products with positive incoming in 30d
}

interface ProductLite {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string;
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
  // Severity order (worst first)
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
    .select("id, sku, name, brand, category, unit_type, reorder_level, cost_price")
    .eq("dealer_id", dealerId)
    .eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand ?? null,
    category: String(p.category),
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

interface SalesAgg {
  sold30: number;
  sold90: number;
  lastSale: string | null;
}

async function loadSalesMap(dealerId: string, ids: string[]) {
  const m = new Map<string, SalesAgg>();
  if (!ids.length) return m;
  const sinceLong = isoDaysAgo(VELOCITY_WINDOW_LONG);

  // We need date per sale_item. Join through sales for created_at.
  const { data, error } = await supabase
    .from("sale_items")
    .select("product_id, quantity, sales!inner(created_at, dealer_id)")
    .eq("dealer_id", dealerId)
    .in("product_id", ids)
    .gte("sales.created_at", sinceLong);
  if (error) {
    // fail soft — velocity becomes 0
    return m;
  }

  const cutoff30 = today().getTime() - VELOCITY_WINDOW_SHORT * 86_400_000;
  for (const row of (data ?? []) as Array<{
    product_id: string;
    quantity: number | string;
    sales: { created_at: string } | null;
  }>) {
    const createdAt = row.sales?.created_at;
    if (!createdAt) continue;
    const ts = new Date(createdAt).getTime();
    const qty = Number(row.quantity ?? 0);
    const cur = m.get(row.product_id) ?? { sold30: 0, sold90: 0, lastSale: null };
    cur.sold90 += qty;
    if (ts >= cutoff30) cur.sold30 += qty;
    if (!cur.lastSale || createdAt > cur.lastSale) cur.lastSale = createdAt;
    m.set(row.product_id, cur);
  }

  // Also fetch ALL last-sale date so dead stock can detect products with sales >90d ago.
  // (Cheaper: single grouped query for last sale date per product.)
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
      m.set(row.product_id, { sold30: 0, sold90: 0, lastSale: createdAt });
    }
  }

  return m;
}

async function loadIncomingMap(dealerId: string, ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const since = isoDaysAgo(INCOMING_WINDOW);
  const { data, error } = await supabase
    .from("purchase_items")
    .select("product_id, quantity, purchases!inner(purchase_date, dealer_id)")
    .eq("dealer_id", dealerId)
    .in("product_id", ids)
    .gte("purchases.purchase_date", since.slice(0, 10));
  if (error) return new Map<string, number>();
  const m = new Map<string, number>();
  for (const row of (data ?? []) as Array<{
    product_id: string;
    quantity: number | string;
  }>) {
    m.set(row.product_id, (m.get(row.product_id) ?? 0) + Number(row.quantity ?? 0));
  }
  return m;
}

function classify(
  p: ProductLite,
  totalStock: number,
  reserved: number,
  shortage: number,
  sold30: number,
  sold90: number,
  lastSale: string | null,
): { flags: DemandFlag[]; velocity: number; cover: number | null; suggested: number } {
  const free = Math.max(0, totalStock - reserved);
  const velocity = sold30 / VELOCITY_WINDOW_SHORT;
  const cover = velocity > 0 ? free / velocity : null;

  const flags: DemandFlag[] = [];
  if (velocity > 0 && (free <= 0 || (cover !== null && cover < STOCKOUT_COVER_DAYS))) {
    flags.push("stockout_risk");
  }
  if (velocity > 0 && free <= p.reorder_level) {
    flags.push("low_stock");
  }
  if (
    velocity > 0 &&
    (free <= p.reorder_level || (cover !== null && cover < REORDER_COVER_DAYS))
  ) {
    flags.push("reorder_suggested");
  }
  if (sold30 >= FAST_MOVING_30D_QTY) flags.push("fast_moving");
  if (sold90 > 0 && sold30 < SLOW_MOVING_30D_MAX) flags.push("slow_moving");

  const daysSince = daysBetween(lastSale);
  if (totalStock > 0 && (daysSince === null || daysSince >= DEAD_STOCK_DAYS) && sold90 === 0) {
    flags.push("dead_stock");
  }

  // Suggestion qty
  const targetQty = Math.ceil(velocity * TARGET_COVER_DAYS);
  const fromTarget = Math.max(0, targetQty - free + shortage);
  const fromReorder = Math.max(0, p.reorder_level * 2 - free);
  const suggested = Math.max(fromTarget, fromReorder);

  return { flags: flags.length ? flags : ["ok"], velocity, cover, suggested };
}

async function getDemandRows(dealerId: string): Promise<DemandRow[]> {
  const products = await loadProducts(dealerId);
  if (!products.length) return [];
  const ids = products.map((p) => p.id);

  const [stockMap, reservedMap, shortageMap, salesMap, incomingMap] = await Promise.all([
    loadStockMap(dealerId, ids),
    loadReservedMap(dealerId, ids),
    loadShortageMap(dealerId, ids),
    loadSalesMap(dealerId, ids),
    loadIncomingMap(dealerId, ids),
  ]);

  const rows: DemandRow[] = products.map((p) => {
    const total = stockMap.get(p.id)?.total ?? 0;
    const reserved = reservedMap.get(p.id) ?? 0;
    const shortage = shortageMap.get(p.id) ?? 0;
    const incoming = incomingMap.get(p.id) ?? 0;
    const sales = salesMap.get(p.id) ?? { sold30: 0, sold90: 0, lastSale: null };

    const { flags, velocity, cover, suggested } = classify(
      p, total, reserved, shortage, sales.sold30, sales.sold90, sales.lastSale,
    );

    return {
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      category: p.category,
      unit_type: p.unit_type,
      reorder_level: p.reorder_level,
      total_stock: total,
      reserved_stock: reserved,
      free_stock: Math.max(0, total - reserved),
      open_shortage: shortage,
      incoming_30d: incoming,
      sold_30d: sales.sold30,
      sold_90d: sales.sold90,
      velocity_per_day: Math.round(velocity * 100) / 100,
      days_of_cover: cover === null ? null : Math.round(cover * 10) / 10,
      last_sale_date: sales.lastSale,
      days_since_last_sale: daysBetween(sales.lastSale),
      suggested_reorder_qty: suggested,
      flags,
      primary_flag: pickPrimaryFlag(flags),
    };
  });

  return rows;
}

async function getDashboardStats(dealerId: string): Promise<DemandStats> {
  const rows = await getDemandRows(dealerId);
  const products = await loadProducts(dealerId);
  const costMap = new Map(products.map((p) => [p.id, p.cost_price]));

  let deadValue = 0;
  let reorder = 0, low = 0, risk = 0, dead = 0, fast = 0, slow = 0, incoming = 0;
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
    if (r.incoming_30d > 0) incoming++;
  }

  return {
    reorderNeededCount: reorder,
    lowStockCount: low,
    stockoutRiskCount: risk,
    deadStockCount: dead,
    deadStockValue: Math.round(deadValue * 100) / 100,
    fastMovingCount: fast,
    slowMovingCount: slow,
    incomingCoverageProductCount: incoming,
  };
}

export const demandPlanningService = {
  getDemandRows,
  getDashboardStats,
  // Convenience filters used by reports
  filter(rows: DemandRow[], flag: DemandFlag): DemandRow[] {
    return rows.filter((r) => r.flags.includes(flag));
  },
};

export const DEMAND_THRESHOLDS = {
  VELOCITY_WINDOW_SHORT,
  VELOCITY_WINDOW_LONG,
  STOCKOUT_COVER_DAYS,
  REORDER_COVER_DAYS,
  TARGET_COVER_DAYS,
  FAST_MOVING_30D_QTY,
  SLOW_MOVING_30D_MAX,
  DEAD_STOCK_DAYS,
  INCOMING_WINDOW,
} as const;
