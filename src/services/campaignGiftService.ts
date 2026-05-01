/**
 * Campaign Gift Service — VPS-backed (Phase 3U-14).
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export interface CampaignGift {
  id: string;
  dealer_id: string;
  customer_id: string;
  campaign_name: string;
  description: string | null;
  gift_value: number;
  payment_status: string;
  paid_amount: number;
  created_by: string | null;
  created_at: string;
  customers?: { name: string };
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

export const campaignGiftService = {
  async list(dealerId: string): Promise<CampaignGift[]> {
    const body = await vpsJson<{ rows: CampaignGift[] }>(
      `/api/campaign-gifts?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return body.rows ?? [];
  },

  async create(gift: {
    dealer_id: string;
    customer_id: string;
    campaign_name: string;
    description?: string;
    gift_value: number;
    paid_amount?: number;
    payment_status?: string;
    created_by?: string;
  }) {
    const body = await vpsJson<{ row: CampaignGift }>(`/api/campaign-gifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealerId: gift.dealer_id,
        customer_id: gift.customer_id,
        campaign_name: gift.campaign_name,
        description: gift.description,
        gift_value: gift.gift_value,
        paid_amount: gift.paid_amount,
        payment_status: gift.payment_status,
        created_by: gift.created_by,
      }),
    });
    return body.row;
  },

  async update(id: string, updates: { paid_amount?: number; payment_status?: string }, dealerId?: string) {
    await vpsJson<{ row: CampaignGift }>(`/api/campaign-gifts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId, ...updates }),
    });
  },

  async delete(id: string, dealerId?: string) {
    const qs = dealerId ? `?dealerId=${encodeURIComponent(dealerId)}` : "";
    await vpsJson<{ ok: true }>(`/api/campaign-gifts/${id}${qs}`, { method: "DELETE" });
  },
};
