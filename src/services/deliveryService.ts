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

export interface DeliveryItemInput {
  sale_item_id: string;
  product_id: string;
  quantity: number;
}

export interface CreateDeliveryInput {
  dealer_id: string;
  challan_id?: string;
  sale_id?: string;
  delivery_date: string;
  receiver_name?: string;
  receiver_phone?: string;
  delivery_address?: string;
  notes?: string;
  created_by?: string;
  items?: DeliveryItemInput[];
}

export const deliveryService = {
  async list(
    dealerId: string,
    page = 1,
    statusFilter?: string,
    opts: { projectId?: string | null; siteId?: string | null } = {},
  ) {
    const params = new URLSearchParams({ dealerId, page: String(page) });
    if (statusFilter) params.set("statusFilter", statusFilter);
    if (opts.projectId) params.set("projectId", opts.projectId);
    if (opts.siteId) params.set("siteId", opts.siteId);
    const body = await vpsRequest<{ data: any[]; total: number }>(
      `/api/deliveries?${params.toString()}`,
    );
    return { data: body.data ?? [], total: body.total ?? 0 };
  },

  async getById(id: string, dealerId: string) {
    const params = new URLSearchParams({ dealerId });
    return await vpsRequest<any>(`/api/deliveries/${id}?${params.toString()}`);
  },

  async getDeliveryBatches(deliveryId: string, dealerId: string) {
    const params = new URLSearchParams({ dealerId });
    return await vpsRequest<any[]>(
      `/api/deliveries/${deliveryId}/batches?${params.toString()}`,
    );
  },

  async getDeliveredQtyBySale(saleId: string, dealerId: string) {
    const params = new URLSearchParams({ dealerId });
    return await vpsRequest<Record<string, number>>(
      `/api/deliveries/sale/${saleId}/delivered-qty?${params.toString()}`,
    );
  },

  async getStockForProducts(productIds: string[], dealerId: string) {
    if (productIds.length === 0) return {};
    const params = new URLSearchParams({
      dealerId,
      productIds: productIds.join(","),
    });
    return await vpsRequest<Record<string, { box_qty: number; piece_qty: number }>>(
      `/api/deliveries/stock?${params.toString()}`,
    );
  },

  async create(input: CreateDeliveryInput) {
    await assertDealerId(input.dealer_id);
    return await vpsRequest<any>(`/api/deliveries`, {
      method: "POST",
      body: JSON.stringify({
        dealer_id: input.dealer_id,
        challan_id: input.challan_id || null,
        sale_id: input.sale_id || null,
        delivery_date: input.delivery_date,
        receiver_name: input.receiver_name ?? null,
        receiver_phone: input.receiver_phone ?? null,
        delivery_address: input.delivery_address ?? null,
        notes: input.notes ?? null,
        items: input.items ?? [],
      }),
    });
  },

  async updateStatus(id: string, status: string, dealerId: string) {
    await assertDealerId(dealerId);
    await vpsRequest<{ ok: boolean }>(`/api/deliveries/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, dealer_id: dealerId }),
    });
  },
};
