/**
 * purchaseReturnService — VPS-only (Phase 3U-17).
 *
 * All reads + create flow through /api/returns/purchases on the self-hosted
 * backend. The legacy Supabase fallback was removed because production hosts
 * (sanitileserp.com + lovable previews) always resolve AUTH_BACKEND="vps".
 */
import { assertDealerId } from "@/lib/tenancy";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

async function vpsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export interface PurchaseReturnItemInput {
  product_id: string;
  quantity: number;
  unit_price: number;
  reason?: string;
}

export interface CreatePurchaseReturnInput {
  dealer_id: string;
  purchase_id?: string;
  supplier_id: string;
  return_date: string;
  return_no: string;
  notes?: string;
  created_by?: string;
  items: PurchaseReturnItemInput[];
}

export const purchaseReturnService = {
  async list(dealerId: string, page = 1) {
    const body = await vpsRequest<{ data: any[]; total: number }>(
      `/api/returns/purchases?dealerId=${encodeURIComponent(dealerId)}&page=${page}`,
    );
    return { data: body.data ?? [], total: body.total ?? 0 };
  },

  async getNextReturnNo(dealerId: string): Promise<string> {
    const body = await vpsRequest<{ next_no: string }>(
      `/api/returns/purchases/next-no?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return body.next_no;
  },

  async create(input: CreatePurchaseReturnInput) {
    await assertDealerId(input.dealer_id);
    return await vpsRequest<any>(`/api/returns/purchases`, {
      method: "POST",
      body: JSON.stringify({
        dealer_id: input.dealer_id,
        supplier_id: input.supplier_id,
        purchase_id: input.purchase_id || null,
        return_date: input.return_date,
        return_no: input.return_no,
        notes: input.notes ?? null,
        items: input.items,
      }),
    });
  },
};
