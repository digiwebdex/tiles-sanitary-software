import { supabase } from "@/integrations/supabase/client";

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

export const pricingTierService = {
  async listTiers(dealerId: string): Promise<PriceTier[]> {
    const { data, error } = await supabase
      .from("price_tiers")
      .select("*")
      .eq("dealer_id", dealerId)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as PriceTier[];
  },

  async getTier(id: string): Promise<PriceTier> {
    const { data, error } = await supabase
      .from("price_tiers")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data as PriceTier;
  },

  async createTier(dealerId: string, payload: { name: string; description?: string | null; status?: "active" | "inactive" }): Promise<PriceTier> {
    const { data, error } = await supabase
      .from("price_tiers")
      .insert({
        dealer_id: dealerId,
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        status: payload.status ?? "active",
        is_default: false,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("A tier with this name already exists.");
      throw new Error(error.message);
    }
    return data as PriceTier;
  },

  async updateTier(id: string, payload: Partial<{ name: string; description: string | null; status: "active" | "inactive" }>) {
    const update: Record<string, unknown> = {};
    if (payload.name !== undefined) update.name = payload.name.trim();
    if (payload.description !== undefined) update.description = payload.description?.toString().trim() || null;
    if (payload.status !== undefined) update.status = payload.status;
    const { error } = await supabase.from("price_tiers").update(update).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new Error("A tier with this name already exists.");
      throw new Error(error.message);
    }
  },

  async deleteTier(id: string) {
    const { error } = await supabase.from("price_tiers").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async listTierItems(tierId: string): Promise<PriceTierItem[]> {
    const { data, error } = await supabase
      .from("price_tier_items")
      .select("*")
      .eq("tier_id", tierId);
    if (error) throw new Error(error.message);
    return (data ?? []) as PriceTierItem[];
  },

  /** Upsert one tier-product rate. Pass rate=null to remove the override. */
  async setTierRate(dealerId: string, tierId: string, productId: string, rate: number | null) {
    if (rate === null) {
      const { error } = await supabase
        .from("price_tier_items")
        .delete()
        .eq("tier_id", tierId)
        .eq("product_id", productId);
      if (error) throw new Error(error.message);
      return;
    }
    if (!Number.isFinite(rate) || rate < 0) throw new Error("Rate must be ≥ 0");
    const { error } = await supabase
      .from("price_tier_items")
      .upsert(
        {
          dealer_id: dealerId,
          tier_id: tierId,
          product_id: productId,
          rate,
        },
        { onConflict: "tier_id,product_id" },
      );
    if (error) throw new Error(error.message);
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
    const { data: prod, error: pErr } = await supabase
      .from("products")
      .select("default_sale_rate")
      .eq("id", productId)
      .eq("dealer_id", dealerId)
      .single();
    if (pErr) throw new Error(pErr.message);
    const defaultRate = Number(prod?.default_sale_rate ?? 0);

    if (tierId) {
      const tier = await this.getTier(tierId).catch(() => null);
      if (tier && tier.status === "active" && tier.dealer_id === dealerId) {
        const { data: row } = await supabase
          .from("price_tier_items")
          .select("rate")
          .eq("tier_id", tierId)
          .eq("product_id", productId)
          .maybeSingle();
        if (row && row.rate !== null && row.rate !== undefined) {
          return { rate: Number(row.rate), source: "tier", tier_id: tierId };
        }
      }
    }
    return { rate: defaultRate, source: "default", tier_id: null };
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

    const { data: prods, error } = await supabase
      .from("products")
      .select("id, default_sale_rate")
      .eq("dealer_id", dealerId)
      .in("id", productIds);
    if (error) throw new Error(error.message);
    const defaults = new Map((prods ?? []).map((p) => [p.id, Number(p.default_sale_rate ?? 0)]));

    let tierRates = new Map<string, number>();
    let tierActive = false;
    if (tierId) {
      const tier = await this.getTier(tierId).catch(() => null);
      if (tier && tier.status === "active" && tier.dealer_id === dealerId) {
        tierActive = true;
        const { data: items } = await supabase
          .from("price_tier_items")
          .select("product_id, rate")
          .eq("tier_id", tierId)
          .in("product_id", productIds);
        tierRates = new Map((items ?? []).map((it) => [it.product_id, Number(it.rate)]));
      }
    }

    for (const pid of productIds) {
      const tierRate = tierActive ? tierRates.get(pid) : undefined;
      if (tierRate !== undefined) {
        result.set(pid, { rate: tierRate, source: "tier", tier_id: tierId });
      } else {
        result.set(pid, { rate: defaults.get(pid) ?? 0, source: "default", tier_id: null });
      }
    }
    return result;
  },
};
