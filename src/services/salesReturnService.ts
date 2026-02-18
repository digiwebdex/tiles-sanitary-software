import { supabase } from "@/integrations/supabase/client";
import { stockService } from "@/services/stockService";
import { logAudit } from "@/services/auditService";
import { validateInput, createSalesReturnServiceSchema } from "@/lib/validators";

export interface CreateSalesReturnInput {
  dealer_id: string;
  sale_id: string;
  product_id: string;
  qty: number;
  reason: string;
  is_broken: boolean;
  refund_amount: number;
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
    // Service-level validation
    validateInput(createSalesReturnServiceSchema, input);

    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .select("customer_id")
      .eq("id", input.sale_id)
      .single();
    if (saleErr || !sale) throw new Error("Sale not found");

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
        return_date: input.return_date,
        created_by: input.created_by || null,
      })
      .select()
      .single();
    if (rErr) throw new Error(rErr.message);

    if (!input.is_broken) {
      await stockService.restoreStock(input.product_id, input.qty, input.dealer_id);
    }

    const { error: lErr } = await supabase.from("customer_ledger").insert({
      dealer_id: input.dealer_id,
      customer_id: sale.customer_id,
      sale_id: input.sale_id,
      sales_return_id: returnRecord!.id,
      type: "refund",
      amount: -input.refund_amount,
      description: `Return${input.is_broken ? " (broken)" : ""}: ${input.reason || "No reason"}`,
    });
    if (lErr) throw new Error(lErr.message);

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
      },
    });

    return returnRecord;
  },
};
