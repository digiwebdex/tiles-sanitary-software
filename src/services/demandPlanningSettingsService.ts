import { supabase } from "@/integrations/supabase/client";

/**
 * Dealer-scoped Demand Planning thresholds.
 * Read-only by salesman; mutated only by dealer_admin (enforced via RLS).
 * Settings are advisory — they only change how reports/widgets classify rows.
 * They do NOT touch stock, ledger, or purchase flow.
 */
export interface DemandPlanningSettings {
  dealer_id: string;
  velocity_window_days: number;
  stockout_cover_days: number;
  reorder_cover_days: number;
  target_cover_days: number;
  fast_moving_30d_qty: number;
  slow_moving_30d_max: number;
  dead_stock_days: number;
  incoming_window_days: number;
  safety_stock_days: number;
}

export const DEMAND_PLANNING_DEFAULTS: Omit<DemandPlanningSettings, "dealer_id"> = {
  velocity_window_days: 30,
  stockout_cover_days: 7,
  reorder_cover_days: 14,
  target_cover_days: 30,
  fast_moving_30d_qty: 20,
  slow_moving_30d_max: 5,
  dead_stock_days: 90,
  incoming_window_days: 30,
  safety_stock_days: 0,
};

export const DEMAND_PLANNING_LIMITS = {
  velocity_window_days: { min: 7, max: 365 },
  stockout_cover_days: { min: 1, max: 60 },
  reorder_cover_days: { min: 1, max: 90 },
  target_cover_days: { min: 7, max: 180 },
  fast_moving_30d_qty: { min: 1, max: 100_000 },
  slow_moving_30d_max: { min: 0, max: 100_000 },
  dead_stock_days: { min: 14, max: 730 },
  incoming_window_days: { min: 7, max: 180 },
  safety_stock_days: { min: 0, max: 90 },
} as const;

function withDefaults(dealerId: string, row: Partial<DemandPlanningSettings> | null): DemandPlanningSettings {
  return {
    dealer_id: dealerId,
    ...DEMAND_PLANNING_DEFAULTS,
    ...(row ?? {}),
  } as DemandPlanningSettings;
}

function validate(s: Omit<DemandPlanningSettings, "dealer_id">): string | null {
  for (const key of Object.keys(DEMAND_PLANNING_LIMITS) as Array<keyof typeof DEMAND_PLANNING_LIMITS>) {
    const v = s[key];
    const { min, max } = DEMAND_PLANNING_LIMITS[key];
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < min || v > max) {
      return `${String(key).replace(/_/g, " ")} must be an integer between ${min} and ${max}`;
    }
  }
  if (s.stockout_cover_days >= s.reorder_cover_days) {
    return "Stockout cover days must be less than reorder cover days";
  }
  if (s.reorder_cover_days > s.target_cover_days) {
    return "Reorder cover days cannot exceed target cover days";
  }
  if (s.slow_moving_30d_max >= s.fast_moving_30d_qty) {
    return "Slow-moving threshold must be less than fast-moving threshold";
  }
  return null;
}

async function get(dealerId: string): Promise<DemandPlanningSettings> {
  // Untyped to avoid stale generated types blocking the build.
  const { data, error } = await (supabase as any)
    .from("demand_planning_settings")
    .select("*")
    .eq("dealer_id", dealerId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return withDefaults(dealerId, data ?? null);
}

async function upsert(
  dealerId: string,
  patch: Omit<DemandPlanningSettings, "dealer_id">,
): Promise<DemandPlanningSettings> {
  const err = validate(patch);
  if (err) throw new Error(err);

  const payload = { dealer_id: dealerId, ...patch };
  const { data, error } = await (supabase as any)
    .from("demand_planning_settings")
    .upsert(payload, { onConflict: "dealer_id" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as DemandPlanningSettings;
}

async function reset(dealerId: string): Promise<DemandPlanningSettings> {
  return upsert(dealerId, DEMAND_PLANNING_DEFAULTS);
}

export const demandPlanningSettingsService = { get, upsert, reset };
