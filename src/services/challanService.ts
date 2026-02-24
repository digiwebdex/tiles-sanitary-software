import { supabase } from "@/integrations/supabase/client";
import { stockService } from "@/services/stockService";
import { salesService } from "@/services/salesService";
import { customerLedgerService, cashLedgerService } from "@/services/ledgerService";
import { logAudit } from "@/services/auditService";
import { assertDealerId } from "@/lib/tenancy";
import { rateLimits } from "@/lib/rateLimit";

export interface CreateChallanInput {
  dealer_id: string;
  sale_id: string;
  challan_date: string;
  driver_name?: string;
  transport_name?: string;
  vehicle_no?: string;
  notes?: string;
  created_by?: string;
  show_price?: boolean;
}

async function generateChallanNumber(dealerId: string): Promise<string> {
  const { count } = await supabase
    .from("challans")
    .select("id", { count: "exact", head: true })
    .eq("dealer_id", dealerId);
  const next = (count ?? 0) + 1;
  return `CH-${String(next).padStart(5, "0")}`;
}

export const challanService = {
  async list(dealerId: string) {
    const { data, error } = await supabase
      .from("challans")
      .select("*, sales(invoice_number, customer_id, customers(name))")
      .eq("dealer_id", dealerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async getBySaleId(saleId: string) {
    const { data, error } = await supabase
      .from("challans")
      .select("*")
      .eq("sale_id", saleId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("challans")
      .select("*, sales(*, customers(name, type, phone, address), sale_items(*, products(name, sku, unit_type, per_box_sft)))")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Create challan: reserve stock (no ledger entries)
   */
  async create(input: CreateChallanInput) {
    rateLimits.api("challan_create");
    await assertDealerId(input.dealer_id);

    // Verify sale exists and is in challan_mode + draft status
    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .select("*, sale_items(product_id, quantity, products(unit_type))")
      .eq("id", input.sale_id)
      .single();
    if (saleErr || !sale) throw new Error("Sale not found");
    if ((sale as any).sale_type !== "challan_mode") throw new Error("Sale is not in challan mode");
    if ((sale as any).sale_status !== "draft") throw new Error("Challan already created for this sale");

    const items = (sale as any).sale_items ?? [];

    // Validate stock availability and reserve
    for (const item of items) {
      await stockService.reserveStock(item.product_id, Number(item.quantity), input.dealer_id);
    }

    const challanNo = await generateChallanNumber(input.dealer_id);

    const { data: challan, error: cErr } = await supabase
      .from("challans")
      .insert({
        dealer_id: input.dealer_id,
        sale_id: input.sale_id,
        challan_no: challanNo,
        challan_date: input.challan_date,
        driver_name: input.driver_name || null,
        transport_name: input.transport_name || null,
        vehicle_no: input.vehicle_no || null,
        notes: input.notes || null,
        status: "pending",
        created_by: input.created_by || null,
        show_price: input.show_price ?? false,
      } as any)
      .select()
      .single();
    if (cErr) throw new Error(cErr.message);

    // Update sale status
    await supabase
      .from("sales")
      .update({ sale_status: "challan_created" } as any)
      .eq("id", input.sale_id);

    await logAudit({
      dealer_id: input.dealer_id,
      user_id: input.created_by,
      action: "challan_create",
      table_name: "challans",
      record_id: challan!.id,
      new_data: { challan_no: challanNo, sale_id: input.sale_id },
    });

    return challan;
  },

  /**
   * Mark delivered: update challan status (stock stays reserved)
   */
  async markDelivered(challanId: string, dealerId: string) {
    await assertDealerId(dealerId);

    const { data: challan, error } = await supabase
      .from("challans")
      .select("*, sales(id, sale_status)")
      .eq("id", challanId)
      .eq("dealer_id", dealerId)
      .single();
    if (error || !challan) throw new Error("Challan not found");
    if ((challan as any).status !== "pending") throw new Error("Challan is not pending");

    await supabase
      .from("challans")
      .update({ status: "delivered" } as any)
      .eq("id", challanId);

    await supabase
      .from("sales")
      .update({ sale_status: "delivered" } as any)
      .eq("id", (challan as any).sale_id);

    await logAudit({
      dealer_id: dealerId,
      action: "challan_delivered",
      table_name: "challans",
      record_id: challanId,
    });
  },

  /**
   * Convert to Invoice: deduct reserved stock permanently, create ledger entries, calc profit
   */
  async convertToInvoice(saleId: string, dealerId: string) {
    await assertDealerId(dealerId);

    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .select("*, sale_items(product_id, quantity, total, products(unit_type, per_box_sft)), customers(name)")
      .eq("id", saleId)
      .eq("dealer_id", dealerId)
      .single();
    if (saleErr || !sale) throw new Error("Sale not found");
    if ((sale as any).sale_status !== "delivered" && (sale as any).sale_status !== "challan_created") {
      throw new Error("Sale must be delivered or challan_created to convert to invoice");
    }

    const items = (sale as any).sale_items ?? [];

    // Deduct reserved stock permanently (reserved → gone)
    for (const item of items) {
      await stockService.deductReservedStock(item.product_id, Number(item.quantity), dealerId);
    }

    // Create ledger entries
    await customerLedgerService.addEntry({
      dealer_id: dealerId,
      customer_id: sale.customer_id,
      sale_id: saleId,
      type: "sale",
      amount: Number(sale.total_amount),
      description: `Sale ${sale.invoice_number}`,
      entry_date: sale.sale_date,
    });

    if (Number(sale.paid_amount) > 0) {
      await customerLedgerService.addEntry({
        dealer_id: dealerId,
        customer_id: sale.customer_id,
        sale_id: saleId,
        type: "payment",
        amount: -Number(sale.paid_amount),
        description: `Payment received for ${sale.invoice_number}`,
        entry_date: sale.sale_date,
      });

      await cashLedgerService.addEntry({
        dealer_id: dealerId,
        type: "receipt",
        amount: Number(sale.paid_amount),
        description: `Payment received: ${sale.invoice_number}`,
        reference_type: "sales",
        reference_id: saleId,
        entry_date: sale.sale_date,
      });
    }

    // Update sale status to invoiced
    await supabase
      .from("sales")
      .update({ sale_status: "invoiced" } as any)
      .eq("id", saleId);

    await logAudit({
      dealer_id: dealerId,
      action: "challan_convert_invoice",
      table_name: "sales",
      record_id: saleId,
    });
  },

  /**
   * Update challan details (transport, notes, date) and optionally sale items
   */
  async update(challanId: string, dealerId: string, updates: {
    challan_date?: string;
    driver_name?: string;
    transport_name?: string;
    vehicle_no?: string;
    notes?: string;
    items?: { id: string; product_id: string; quantity: number; sale_rate: number }[];
  }) {
    await assertDealerId(dealerId);

    const { data: challan, error: fetchErr } = await supabase
      .from("challans")
      .select("id, status, sale_id")
      .eq("id", challanId)
      .eq("dealer_id", dealerId)
      .single();
    if (fetchErr || !challan) throw new Error("Challan not found");
    if ((challan as any).status === "cancelled") throw new Error("Cannot edit a cancelled challan");

    const { error } = await supabase
      .from("challans")
      .update({
        challan_date: updates.challan_date,
        driver_name: updates.driver_name || null,
        transport_name: updates.transport_name || null,
        vehicle_no: updates.vehicle_no || null,
        notes: updates.notes || null,
      } as any)
      .eq("id", challanId);
    if (error) throw new Error(error.message);

    // Update sale items if provided
    if (updates.items && updates.items.length > 0) {
      const saleId = (challan as any).sale_id;

      // Fetch product details for SFT calc
      const productIds = updates.items.map(i => i.product_id);
      const { data: products } = await supabase
        .from("products")
        .select("id, unit_type, per_box_sft")
        .in("id", productIds);
      const productMap = new Map((products ?? []).map(p => [p.id, p]));

      // Fetch old items for stock adjustment
      const { data: oldItems } = await supabase
        .from("sale_items")
        .select("product_id, quantity")
        .eq("sale_id", saleId)
        .eq("dealer_id", dealerId);

      // Unreserve old stock
      for (const oi of (oldItems ?? [])) {
        await stockService.unreserveStock(oi.product_id, Number(oi.quantity), dealerId);
      }

      let totalBox = 0, totalSft = 0, totalPiece = 0;

      // Update each item
      for (const item of updates.items) {
        const product = productMap.get(item.product_id);
        const unitType = product?.unit_type ?? "piece";
        const perBoxSft = product?.per_box_sft ?? 0;
        let itemTotal: number;
        let itemSft: number | null = null;

        if (unitType === "box_sft") {
          totalBox += item.quantity;
          itemSft = item.quantity * perBoxSft;
          totalSft += itemSft;
          itemTotal = itemSft * item.sale_rate;
        } else {
          totalPiece += item.quantity;
          itemTotal = item.quantity * item.sale_rate;
        }

        await supabase
          .from("sale_items")
          .update({
            quantity: item.quantity,
            sale_rate: item.sale_rate,
            total: itemTotal,
            total_sft: itemSft,
          } as any)
          .eq("id", item.id);
      }

      // Reserve new stock
      for (const item of updates.items) {
        await stockService.reserveStock(item.product_id, item.quantity, dealerId);
      }

      // Recalc sale totals
      const { data: updatedItems } = await supabase
        .from("sale_items")
        .select("total")
        .eq("sale_id", saleId);
      const subtotal = (updatedItems ?? []).reduce((s, i) => s + Number(i.total), 0);

      const { data: saleData } = await supabase
        .from("sales")
        .select("discount, paid_amount")
        .eq("id", saleId)
        .single();
      const discount = Number(saleData?.discount ?? 0);
      const paidAmount = Number(saleData?.paid_amount ?? 0);
      const totalAmount = subtotal - discount;
      const dueAmount = totalAmount - paidAmount;

      await supabase
        .from("sales")
        .update({
          total_amount: totalAmount,
          due_amount: dueAmount,
          total_box: totalBox,
          total_sft: totalSft,
          total_piece: totalPiece,
        } as any)
        .eq("id", saleId);
    }

    await logAudit({
      dealer_id: dealerId,
      action: "challan_update",
      table_name: "challans",
      record_id: challanId,
      new_data: updates,
    });
  },

  /**
   * Cancel challan: restore reserved stock to available
   */
  async cancelChallan(challanId: string, dealerId: string) {
    await assertDealerId(dealerId);

    const { data: challan, error } = await supabase
      .from("challans")
      .select("*, sales(id, sale_items(product_id, quantity, products(unit_type)))")
      .eq("id", challanId)
      .eq("dealer_id", dealerId)
      .single();
    if (error || !challan) throw new Error("Challan not found");

    const sale = (challan as any).sales;
    if (!sale) throw new Error("Associated sale not found");

    const status = (challan as any).status;
    if (status !== "pending" && status !== "delivered") {
      throw new Error("Cannot cancel this challan");
    }

    const items = sale.sale_items ?? [];

    // Unreserve stock (move from reserved back to available)
    for (const item of items) {
      await stockService.unreserveStock(item.product_id, Number(item.quantity), dealerId);
    }

    // Update challan status
    await supabase
      .from("challans")
      .update({ status: "cancelled" } as any)
      .eq("id", challanId);

    // Reset sale status back to draft
    await supabase
      .from("sales")
      .update({ sale_status: "draft" } as any)
      .eq("id", sale.id);

    await logAudit({
      dealer_id: dealerId,
      action: "challan_cancel",
      table_name: "challans",
      record_id: challanId,
    });
  },
};
