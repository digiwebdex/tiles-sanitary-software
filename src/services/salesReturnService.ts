import { supabase } from "@/integrations/supabase/client";
import { stockService } from "@/services/stockService";
import { cashLedgerService, customerLedgerService } from "@/services/ledgerService";
import { logAudit } from "@/services/auditService";
import { backorderAllocationService } from "@/services/backorderAllocationService";
import { validateInput, createSalesReturnServiceSchema } from "@/lib/validators";
import { assertDealerId } from "@/lib/tenancy";

export interface CreateSalesReturnInput {
  dealer_id: string;
  sale_id: string;
  product_id: string;
  qty: number;
  reason: string;
  is_broken: boolean;
  refund_amount: number;
  refund_mode?: string;
  return_date: string;
  created_by?: string;
}

export const salesReturnService = {
  async list(dealerId: string) {
    const { data, error } = await supabase
      .from("sales_returns")
      .select("*, sales(invoice_number, customer_id, customers(name)), products(name, sku)")
      .eq("dealer_id", dealerId)
      .order("return_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async getSaleItems(saleId: string) {
    const { data, error } = await supabase
      .from("sale_items")
      .select("*, products(name, sku, unit_type, per_box_sft)")
      .eq("sale_id", saleId);
    if (error) throw new Error(error.message);
    return data;
  },

  async create(input: CreateSalesReturnInput) {
    // Tenant isolation guard
    await assertDealerId(input.dealer_id);
    // Service-level validation
    validateInput(createSalesReturnServiceSchema, input);

    // Fetch sale details including total_amount
    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .select("customer_id, total_amount, invoice_number")
      .eq("id", input.sale_id)
      .single();
    if (saleErr || !sale) throw new Error("Sale not found");

    // Validate refund does not exceed original sale amount
    if (input.refund_amount > Number(sale.total_amount)) {
      throw new Error("Refund amount cannot exceed original sale amount");
    }

    // Validate return qty does not exceed sold qty for this product
    const { data: saleItem, error: siErr } = await supabase
      .from("sale_items")
      .select("quantity")
      .eq("sale_id", input.sale_id)
      .eq("product_id", input.product_id)
      .single();
    if (siErr || !saleItem) throw new Error("Product not found in this sale");

    // Check already-returned qty for this product on this sale
    const { data: existingReturns, error: erErr } = await supabase
      .from("sales_returns")
      .select("qty")
      .eq("sale_id", input.sale_id)
      .eq("product_id", input.product_id);
    if (erErr) throw new Error(erErr.message);

    const alreadyReturned = (existingReturns ?? []).reduce((s, r) => s + Number(r.qty), 0);
    if (alreadyReturned + input.qty > Number(saleItem.quantity)) {
      throw new Error("Return quantity exceeds sold quantity");
    }

    // Insert return record
    const { data: returnRecord, error: rErr } = await supabase
      .from("sales_returns")
      .insert({
        dealer_id: input.dealer_id,
        sale_id: input.sale_id,
        product_id: input.product_id,
        qty: input.qty,
        reason: input.reason || null,
        is_broken: input.is_broken,
        refund_amount: input.refund_amount,
        refund_mode: input.refund_mode || null,
        return_date: input.return_date,
        created_by: input.created_by || null,
      })
      .select()
      .single();
    if (rErr) throw new Error(rErr.message);

    // Stock handling: restore if not broken
    if (!input.is_broken) {
      await stockService.restoreStock(input.product_id, input.qty, input.dealer_id);
    }

    // Update sale_item fulfillment if this product had backorder tracking
    const { data: saleItem } = await supabase
      .from("sale_items")
      .select("id, backorder_qty, allocated_qty, fulfillment_status")
      .eq("sale_id", input.sale_id)
      .eq("product_id", input.product_id)
      .single();

    if (saleItem && saleItem.fulfillment_status !== "fulfilled") {
      // Release allocations proportionally if return reduces the effective order
      await backorderAllocationService.releaseAllocations(saleItem.id, input.dealer_id);
      // Reset backorder state since returned items reduce the need
      const newBackorder = Math.max(0, Number(saleItem.backorder_qty) - input.qty);
      const newAllocated = Math.min(Number(saleItem.allocated_qty), newBackorder);
      const newStatus = newBackorder <= 0 ? "fulfilled" : newAllocated >= newBackorder ? "ready_for_delivery" : newAllocated > 0 ? "partially_allocated" : "pending";
      await supabase.from("sale_items").update({
        backorder_qty: newBackorder,
        allocated_qty: newAllocated,
        fulfillment_status: newStatus,
      } as any).eq("id", saleItem.id);
      await backorderAllocationService.updateSaleBackorderFlag(input.sale_id);
    }

    // Customer ledger — reduce customer's balance (refund)
    await customerLedgerService.addEntry({
      dealer_id: input.dealer_id,
      customer_id: sale.customer_id,
      sale_id: input.sale_id,
      sales_return_id: returnRecord!.id,
      type: "refund",
      amount: -input.refund_amount,
      description: `Return${input.is_broken ? " (broken)" : ""}: ${input.reason || "No reason"} [${sale.invoice_number}]`,
      entry_date: input.return_date,
    });

    // Cash ledger — record cash outflow if refund was paid
    if (input.refund_amount > 0) {
      await cashLedgerService.addEntry({
        dealer_id: input.dealer_id,
        type: "refund",
        amount: -input.refund_amount,
        description: `Refund for return: ${sale.invoice_number}`,
        reference_type: "sales_returns",
        reference_id: returnRecord!.id,
        entry_date: input.return_date,
      });
    }

    // Audit log
    await logAudit({
      dealer_id: input.dealer_id,
      user_id: input.created_by,
      action: "refund",
      table_name: "sales_returns",
      record_id: returnRecord!.id,
      new_data: {
        sale_id: input.sale_id,
        product_id: input.product_id,
        qty: input.qty,
        is_broken: input.is_broken,
        refund_amount: input.refund_amount,
        refund_mode: input.refund_mode,
      },
    });

    return returnRecord;
  },
};
