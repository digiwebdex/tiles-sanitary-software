import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";
import { assertDealerId } from "@/lib/tenancy";

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
}

const PAGE_SIZE = 25;

export const deliveryService = {
  async list(dealerId: string, page = 1, statusFilter?: string) {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("deliveries")
      .select("*, challans(challan_no), sales(invoice_number, customers(name, phone, address))", { count: "exact" })
      .eq("dealer_id", dealerId)
      .order("delivery_date", { ascending: false })
      .range(from, to);

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { data: data ?? [], total: count ?? 0 };
  },

  async create(input: CreateDeliveryInput) {
    await assertDealerId(input.dealer_id);

    const { data, error } = await supabase
      .from("deliveries")
      .insert({
        dealer_id: input.dealer_id,
        challan_id: input.challan_id || null,
        sale_id: input.sale_id || null,
        delivery_date: input.delivery_date,
        status: "pending",
        receiver_name: input.receiver_name || null,
        receiver_phone: input.receiver_phone || null,
        delivery_address: input.delivery_address || null,
        notes: input.notes || null,
        created_by: input.created_by || null,
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAudit({
      dealer_id: input.dealer_id,
      user_id: input.created_by,
      action: "delivery_create",
      table_name: "deliveries",
      record_id: data!.id,
      new_data: { ...input } as Record<string, unknown>,
    });

    return data;
  },

  async updateStatus(id: string, status: string, dealerId: string) {
    await assertDealerId(dealerId);

    const { error } = await supabase
      .from("deliveries")
      .update({ status } as any)
      .eq("id", id)
      .eq("dealer_id", dealerId);
    if (error) throw new Error(error.message);

    await logAudit({
      dealer_id: dealerId,
      action: "delivery_status_update",
      table_name: "deliveries",
      record_id: id,
      new_data: { status },
    });
  },

  async getById(id: string, dealerId: string) {
    const { data, error } = await supabase
      .from("deliveries")
      .select("*, challans(challan_no), sales(invoice_number, sale_items(*, products(name, sku, unit_type, per_box_sft)), customers(name, phone, address))")
      .eq("id", id)
      .eq("dealer_id", dealerId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};
