import { validateInput, createPurchaseServiceSchema } from "@/lib/validators";
import { assertDealerId } from "@/lib/tenancy";
import { rateLimits } from "@/lib/rateLimit";
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

export interface PurchaseItemInput {
  product_id: string;
  quantity: number;
  purchase_rate: number;
  offer_price: number;
  transport_cost: number;
  labor_cost: number;
  other_cost: number;
  batch_no?: string;
  lot_no?: string;
  shade_code?: string;
  caliber?: string;
}

export interface CreatePurchaseInput {
  dealer_id: string;
  supplier_id: string;
  invoice_number: string;
  purchase_date: string;
  notes?: string;
  created_by?: string;
  items: PurchaseItemInput[];
}

export const purchaseService = {
  async list(dealerId: string, page = 1, search?: string) {
    const params = new URLSearchParams({ dealerId, page: String(page) });
    if (search?.trim()) params.set("search", search.trim());
    const body = await vpsRequest<{ data: any[]; total: number }>(
      `/api/purchases?${params.toString()}`,
    );
    return { data: body.data ?? [], total: body.total ?? 0 };
  },

  async getById(id: string) {
    return await vpsRequest<any>(`/api/purchases/${id}`);
  },

  async create(input: CreatePurchaseInput) {
    rateLimits.api("purchase_create");
    await assertDealerId(input.dealer_id);
    validateInput(createPurchaseServiceSchema, input);

    return await vpsRequest<any>(`/api/purchases`, {
      method: "POST",
      body: JSON.stringify({
        dealer_id: input.dealer_id,
        supplier_id: input.supplier_id,
        invoice_number: input.invoice_number || null,
        purchase_date: input.purchase_date,
        notes: input.notes ?? null,
        items: input.items,
      }),
    });
  },
};
