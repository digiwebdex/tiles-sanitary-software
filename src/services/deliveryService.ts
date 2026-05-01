import { supabase } from "@/integrations/supabase/client";
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

const PAGE_SIZE = 25;

export const deliveryService = {
  async list(
    dealerId: string,
    page = 1,
    statusFilter?: string,
    opts: { projectId?: string | null; siteId?: string | null } = {},
  ) {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("deliveries")
      .select("*, challans(challan_no), sales(invoice_number, customers(name, phone, address)), projects:projects(id, project_name, project_code), project_sites:project_sites(id, site_name, address), delivery_items(id, quantity, products(name, unit_type))", { count: "exact" })
      .eq("dealer_id", dealerId)
      .order("delivery_date", { ascending: false })
      .range(from, to);

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (opts.projectId) query = query.eq("project_id", opts.projectId);
    if (opts.siteId) query = query.eq("site_id", opts.siteId);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { data: data ?? [], total: count ?? 0 };
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

  async getById(id: string, dealerId: string) {
    const { data, error } = await supabase
      .from("deliveries")
      .select("*, challans(challan_no), delivery_items(*, products(name, sku, unit_type, per_box_sft)), sales(invoice_number, sale_items(*, products(name, sku, unit_type, per_box_sft)), customers(name, phone, address)), projects:projects(id, project_name, project_code), project_sites:project_sites(id, site_name, address, contact_person, contact_phone)")
      .eq("id", id)
      .eq("dealer_id", dealerId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Get batch breakdown for delivery items
   */
  async getDeliveryBatches(deliveryId: string, dealerId: string) {
    const { data, error } = await supabase
      .from("delivery_item_batches")
      .select("*, product_batches(batch_no, shade_code, caliber, lot_no)")
      .eq("dealer_id", dealerId);
    if (error) throw new Error(error.message);

    // Filter by delivery_item_ids belonging to this delivery
    const { data: diIds } = await supabase
      .from("delivery_items")
      .select("id")
      .eq("delivery_id", deliveryId)
      .eq("dealer_id", dealerId);

    const idSet = new Set((diIds ?? []).map(d => d.id));
    return (data ?? []).filter((dib: any) => idSet.has(dib.delivery_item_id));
  },

  /**
   * Get total delivered quantities per sale_item for a given sale
   */
  async getDeliveredQtyBySale(saleId: string, dealerId: string) {
    const { data: deliveries, error: dErr } = await supabase
      .from("deliveries")
      .select("id")
      .eq("sale_id", saleId)
      .eq("dealer_id", dealerId);
    if (dErr) throw new Error(dErr.message);
    if (!deliveries || deliveries.length === 0) return {};

    const deliveryIds = deliveries.map(d => d.id);

    const { data: items, error: iErr } = await supabase
      .from("delivery_items" as any)
      .select("sale_item_id, quantity")
      .in("delivery_id", deliveryIds);
    if (iErr) throw new Error(iErr.message);

    const result: Record<string, number> = {};
    for (const item of (items as any[]) ?? []) {
      const key = item.sale_item_id;
      result[key] = (result[key] || 0) + Number(item.quantity);
    }
    return result;
  },

  /**
   * Get available stock for products
   */
  async getStockForProducts(productIds: string[], dealerId: string) {
    const { data, error } = await supabase
      .from("stock")
      .select("product_id, box_qty, piece_qty")
      .in("product_id", productIds)
      .eq("dealer_id", dealerId);
    if (error) throw new Error(error.message);

    const result: Record<string, { box_qty: number; piece_qty: number }> = {};
    for (const s of data ?? []) {
      result[s.product_id] = { box_qty: Number(s.box_qty), piece_qty: Number(s.piece_qty) };
    }
    return result;
  },

};

