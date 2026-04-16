import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";
import { assertDealerId } from "@/lib/tenancy";

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

async function generateDeliveryNo(dealerId: string): Promise<string> {
  const { count } = await supabase
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .eq("dealer_id", dealerId);
  const seq = (count ?? 0) + 1;
  return `DL-${String(seq).padStart(5, "0")}`;
}

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

    const deliveryNo = await generateDeliveryNo(input.dealer_id);

    // Inherit project/site from sale (preferred) or challan
    let projectId: string | null = null;
    let siteId: string | null = null;
    if (input.sale_id) {
      const { data: s } = await supabase
        .from("sales")
        .select("project_id, site_id")
        .eq("id", input.sale_id)
        .maybeSingle();
      projectId = (s as any)?.project_id ?? null;
      siteId = (s as any)?.site_id ?? null;
    }
    if (!projectId && input.challan_id) {
      const { data: c } = await supabase
        .from("challans")
        .select("project_id, site_id")
        .eq("id", input.challan_id)
        .maybeSingle();
      projectId = (c as any)?.project_id ?? null;
      siteId = (c as any)?.site_id ?? null;
    }

    // If a site is linked but no explicit delivery_address provided, prefer site address
    let resolvedAddress = input.delivery_address || null;
    if (!resolvedAddress && siteId) {
      const { data: site } = await supabase
        .from("project_sites")
        .select("address")
        .eq("id", siteId)
        .maybeSingle();
      resolvedAddress = (site as any)?.address ?? null;
    }

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
        delivery_address: resolvedAddress,
        notes: input.notes || null,
        created_by: input.created_by || null,
        delivery_no: deliveryNo,
        project_id: projectId,
        site_id: siteId,
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Insert delivery items if provided
    if (input.items && input.items.length > 0) {
      const itemRows = input.items
        .filter(i => i.quantity > 0)
        .map(i => ({
          delivery_id: data!.id,
          sale_item_id: i.sale_item_id,
          product_id: i.product_id,
          dealer_id: input.dealer_id,
          quantity: i.quantity,
        }));

      if (itemRows.length > 0) {
        const { error: itemError } = await supabase
          .from("delivery_items" as any)
          .insert(itemRows as any);
        if (itemError) throw new Error(itemError.message);
      }

      // Populate delivery_item_batches atomically via DB function
      try {
        await supabase.rpc("execute_delivery_batches" as any, {
          _delivery_id: data!.id,
          _dealer_id: input.dealer_id,
        });
      } catch (e) {
        // Non-fatal: legacy/unbatched deliveries proceed without batch tracking
        console.warn("Delivery batch tracking skipped:", e);
      }
    }

    await logAudit({
      dealer_id: input.dealer_id,
      user_id: input.created_by,
      action: "delivery_create",
      table_name: "deliveries",
      record_id: data!.id,
      new_data: { ...input, delivery_no: deliveryNo } as Record<string, unknown>,
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

  /**
   * Update sale status based on delivery progress
   */
  async updateSaleDeliveryStatus(saleId: string, dealerId: string) {
    const { data: saleItems, error: siErr } = await supabase
      .from("sale_items")
      .select("id, quantity")
      .eq("sale_id", saleId)
      .eq("dealer_id", dealerId);
    if (siErr) throw new Error(siErr.message);

    const deliveredQty = await this.getDeliveredQtyBySale(saleId, dealerId);

    let totalOrdered = 0;
    let totalDelivered = 0;
    for (const si of saleItems ?? []) {
      totalOrdered += Number(si.quantity);
      totalDelivered += deliveredQty[si.id] || 0;
    }

    let newStatus: string | null = null;
    if (totalDelivered >= totalOrdered && totalOrdered > 0) {
      newStatus = "delivered";
    } else if (totalDelivered > 0) {
      newStatus = "partially_delivered";
    }

    if (newStatus) {
      await supabase
        .from("sales")
        .update({ sale_status: newStatus } as any)
        .eq("id", saleId)
        .eq("dealer_id", dealerId);
    }
  },
};
