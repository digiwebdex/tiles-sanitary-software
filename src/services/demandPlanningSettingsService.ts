import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

/**
 * Dealer-scoped Demand Planning thresholds — VPS-backed (Phase 3U-14).
 * Read-only by salesman; mutated only by dealer_admin (enforced server-side).
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

async function vpsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  if (res.status === 204) return undefined as unknown as T;
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

async function get(dealerId: string): Promise<DemandPlanningSettings> {
  const body = await vpsJson<{ row: DemandPlanningSettings }>(
    `/api/demand-planning-settings?dealerId=${encodeURIComponent(dealerId)}`,
  );
  return body.row;
}

async function upsert(
  dealerId: string,
  patch: Omit<DemandPlanningSettings, "dealer_id">,
): Promise<DemandPlanningSettings> {
  const body = await vpsJson<{ row: DemandPlanningSettings }>(`/api/demand-planning-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dealerId, ...patch }),
  });
  return body.row;
}

async function reset(dealerId: string): Promise<DemandPlanningSettings> {
  const body = await vpsJson<{ row: DemandPlanningSettings }>(
    `/api/demand-planning-settings/reset`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId }),
    },
  );
  return body.row;
}

export const demandPlanningSettingsService = { get, upsert, reset };
