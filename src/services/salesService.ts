import { supabase } from "@/integrations/supabase/client";
import { stockService } from "@/services/stockService";
import { customerLedgerService, cashLedgerService } from "@/services/ledgerService";
import { logAudit } from "@/services/auditService";
import { validateInput, createSaleServiceSchema } from "@/lib/validators";

export interface SaleItemInput {
  product_id: string;
  quantity: number;
  sale_rate: number;
}

export interface CreateSaleInput {
  dealer_id: string;
  customer_id: string;
  sale_date: string;
  discount: number;
  discount_reference: string;
  client_reference: string;
  fitter_reference: string;
  paid_amount: number;
  notes?: string;
  created_by?: string;
  items: SaleItemInput[];
}

const PAGE_SIZE = 25;

async function generateInvoiceNumber(dealerId: string): Promise<string> {
  const { count } = await supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("dealer_id", dealerId);
  const next = (count ?? 0) + 1;
  return `INV-${String(next).padStart(5, "0")}`;
}

export const salesService = {
  async list(dealerId: string, page = 1) {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabase
      .from("sales")
      .select("*, customers(name, type)", { count: "exact" })
      .eq("dealer_id", dealerId)
      .order("sale_date", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    return { data: data ?? [], total: count ?? 0 };
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("sales")
      .select("*, customers(name, type, phone, address), sale_items(*, products(name, sku, unit_type, per_box_sft))")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async create(input: CreateSaleInput) {
    // Service-level validation
    validateInput(createSaleServiceSchema, input);

    // Fetch product details + stock for avg cost
    const productIds = input.items.map((i) => i.product_id);

    const [productsRes, stockRes] = await Promise.all([
      supabase.from("products").select("id, unit_type, per_box_sft").in("id", productIds),
      supabase.from("stock").select("product_id, average_cost_per_unit").eq("dealer_id", input.dealer_id).in("product_id", productIds),
    ]);

    if (productsRes.error) throw new Error(productsRes.error.message);
    if (stockRes.error) throw new Error(stockRes.error.message);

    const productMap = new Map(productsRes.data!.map((p) => [p.id, p]));
    const stockMap = new Map(stockRes.data!.map((s) => [s.product_id, s]));

    let totalBox = 0;
    let totalSft = 0;
    let totalPiece = 0;
    let totalCogs = 0;

    const itemsCalc = input.items.map((item) => {
      const product = productMap.get(item.product_id);
      const stock = stockMap.get(item.product_id);
      const avgCost = stock ? Number(stock.average_cost_per_unit) : 0;
      const itemTotal = item.quantity * item.sale_rate;
      const itemCogs = item.quantity * avgCost;
      let itemSft: number | null = null;

      if (product?.unit_type === "box_sft") {
        totalBox += item.quantity;
        itemSft = item.quantity * (product.per_box_sft ?? 0);
        totalSft += itemSft;
      } else {
        totalPiece += item.quantity;
      }

      totalCogs += itemCogs;

      return { ...item, total: itemTotal, total_sft: itemSft };
    });

    const subtotal = itemsCalc.reduce((s, i) => s + i.total, 0);
    const totalAmount = subtotal - input.discount;
    const dueAmount = totalAmount - input.paid_amount;
    const profit = totalAmount - totalCogs;

    const invoiceNumber = await generateInvoiceNumber(input.dealer_id);

    const { data: sale, error: sErr } = await supabase
      .from("sales")
      .insert({
        dealer_id: input.dealer_id,
        customer_id: input.customer_id,
        invoice_number: invoiceNumber,
        sale_date: input.sale_date,
        total_amount: totalAmount,
        discount: input.discount,
        discount_reference: input.discount_reference || null,
        client_reference: input.client_reference || null,
        fitter_reference: input.fitter_reference || null,
        paid_amount: input.paid_amount,
        due_amount: dueAmount,
        cogs: totalCogs,
        profit,
        total_box: totalBox,
        total_sft: totalSft,
        total_piece: totalPiece,
        notes: input.notes || null,
        created_by: input.created_by || null,
      })
      .select()
      .single();
    if (sErr) throw new Error(sErr.message);

    const itemRows = itemsCalc.map((item) => ({
      sale_id: sale!.id,
      dealer_id: input.dealer_id,
      product_id: item.product_id,
      quantity: item.quantity,
      sale_rate: item.sale_rate,
      total: item.total,
      total_sft: item.total_sft,
    }));

    const { error: iErr } = await supabase.from("sale_items").insert(itemRows);
    if (iErr) throw new Error(iErr.message);

    for (const item of input.items) {
      await stockService.deductStock(item.product_id, item.quantity, input.dealer_id);
    }

    await customerLedgerService.addEntry({
      dealer_id: input.dealer_id,
      customer_id: input.customer_id,
      sale_id: sale!.id,
      type: "sale",
      amount: totalAmount,
      description: `Sale ${invoiceNumber}`,
      entry_date: input.sale_date,
    });

    if (input.paid_amount > 0) {
      await customerLedgerService.addEntry({
        dealer_id: input.dealer_id,
        customer_id: input.customer_id,
        sale_id: sale!.id,
        type: "payment",
        amount: -input.paid_amount,
        description: `Payment received for ${invoiceNumber}`,
        entry_date: input.sale_date,
      });
    }

    if (input.paid_amount > 0) {
      await cashLedgerService.addEntry({
        dealer_id: input.dealer_id,
        type: "receipt",
        amount: input.paid_amount,
        description: `Payment received: ${invoiceNumber}`,
        reference_type: "sales",
        reference_id: sale!.id,
        entry_date: input.sale_date,
      });
    }

    // Audit log
    await logAudit({
      dealer_id: input.dealer_id,
      user_id: input.created_by,
      action: "sale_create",
      table_name: "sales",
      record_id: sale!.id,
      new_data: {
        invoice_number: invoiceNumber,
        customer_id: input.customer_id,
        total_amount: totalAmount,
        item_count: input.items.length,
      },
    });

    return sale;
  },
};
