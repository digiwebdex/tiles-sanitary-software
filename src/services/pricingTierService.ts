/**
 * Pricing Tiers Service — VPS-backed.
 *
 * All CRUD + price resolution goes through /api/pricing-tiers.
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export type RateSource = "default" | "tier" | "manual";

export interface PriceTier {
  id: string;
  dealer_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface PriceTierItem {
  id: string;
  dealer_id: string;
  tier_id: string;
  product_id: string;
  rate: number;
  created_at: string;
  updated_at: string;
}

export interface ResolvedPrice {
  rate: number;
  source: RateSource;
  tier_id: string | null;
}

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

export const pricingTierService = {
  async listTiers(dealerId: string): Promise<PriceTier[]> {
    const body = await vpsJson<{ rows: PriceTier[] }>(
      `/api/pricing-tiers?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return body.rows ?? [];
  },

  async getTier(id: string, dealerId?: string): Promise<PriceTier> {
    const qs = dealerId ? `?dealerId=${encodeURIComponent(dealerId)}` : "";
    const body = await vpsJson<{ row: PriceTier }>(`/api/pricing-tiers/${id}${qs}`);
    return body.row;
  },

  async createTier(
    dealerId: string,
    payload: { name: string; description?: string | null; status?: "active" | "inactive" },
  ): Promise<PriceTier> {
    const body = await vpsJson<{ row: PriceTier }>(`/api/pricing-tiers`, {
      method: "POST",
      body: JSON.stringify({
        dealerId,
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        status: payload.status ?? "active",
      }),
    });
    return body.row;
  },

  async updateTier(
    id: string,
    payload: Partial<{ name: string; description: string | null; status: "active" | "inactive" }>,
    dealerId?: string,
  ): Promise<void> {
    const body: Record<string, unknown> = { ...payload };
    if (dealerId) body.dealerId = dealerId;
    if (payload.name !== undefined) body.name = payload.name.trim();
    if (payload.description !== undefined) {
      body.description = payload.description?.toString().trim() || null;
    }
    await vpsJson<{ row: PriceTier }>(`/api/pricing-tiers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  async deleteTier(id: string, dealerId?: string): Promise<void> {
    const qs = dealerId ? `?dealerId=${encodeURIComponent(dealerId)}` : "";
    await vpsJson<void>(`/api/pricing-tiers/${id}${qs}`, { method: "DELETE" });
  },

  async listTierItems(tierId: string, dealerId?: string): Promise<PriceTierItem[]> {
    const qs = dealerId ? `?dealerId=${encodeURIComponent(dealerId)}` : "";
    const body = await vpsJson<{ rows: PriceTierItem[] }>(
      `/api/pricing-tiers/${tierId}/items${qs}`,
    );
    return body.rows ?? [];
  },

  /** Upsert one tier-product rate. Pass rate=null to remove the override. */
  async setTierRate(
    dealerId: string,
    tierId: string,
    productId: string,
    rate: number | null,
  ): Promise<void> {
    if (rate === null) {
      await vpsJson<void>(
        `/api/pricing-tiers/${tierId}/items/${productId}?dealerId=${encodeURIComponent(dealerId)}`,
        { method: "DELETE" },
      );
      return;
    }
    if (!Number.isFinite(rate) || rate < 0) throw new Error("Rate must be ≥ 0");
    await vpsJson<void>(`/api/pricing-tiers/${tierId}/items/${productId}`, {
      method: "PUT",
      body: JSON.stringify({ dealerId, rate }),
    });
  },

  /**
   * Resolve the price for a single product given an optional tier.
   * Order:
   *  1. tier-specific rate (if tier provided & active & rate row exists)
   *  2. product default_sale_rate
   */
  async resolvePrice(
    dealerId: string,
    productId: string,
    tierId: string | null,
  ): Promise<ResolvedPrice> {
    const map = await this.resolvePricesBatch(dealerId, [productId], tierId);
    return map.get(productId) ?? { rate: 0, source: "default", tier_id: null };
  },

  /**
   * Batch resolve prices for many products (single tier).
   * Returns Map<product_id, ResolvedPrice>.
   */
  async resolvePricesBatch(
    dealerId: string,
    productIds: string[],
    tierId: string | null,
  ): Promise<Map<string, ResolvedPrice>> {
    const result = new Map<string, ResolvedPrice>();
    if (productIds.length === 0) return result;
    const body = await vpsJson<{ items: Record<string, ResolvedPrice> }>(
      `/api/pricing-tiers/resolve`,
      {
        method: "POST",
        body: JSON.stringify({ dealerId, productIds, tierId }),
      },
    );
    for (const [pid, val] of Object.entries(body.items ?? {})) {
      result.set(pid, val);
    }
    return result;
  },
};
