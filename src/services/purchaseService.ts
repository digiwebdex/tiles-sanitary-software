import { supabase } from "@/integrations/supabase/client";
import { stockService } from "@/services/stockService";
import { supplierLedgerService, cashLedgerService } from "@/services/ledgerService";
import { logAudit } from "@/services/auditService";
import { validateInput, createPurchaseServiceSchema } from "@/lib/validators";
import { assertDealerId } from "@/lib/tenancy";
import { rateLimits } from "@/lib/rateLimit";

export interface PurchaseItemInput {
  product_id: string;
  quantity: number;
  purchase_rate: number;
  offer_price: number;
  transport_cost: number;
  labor_cost: number;
  other_cost: number;
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

const PAGE_SIZE = 25;

function calcLandedCost(item: PurchaseItemInput): number {
  const itemTotal = item.quantity * item.purchase_rate;
  return itemTotal + item.transport_cost + item.labor_cost + item.other_cost;
}

function calcTotalSft(quantity: number, unitType: string, perBoxSft: number | null): number | null {
  if (unitType === "box_sft" && perBoxSft) return quantity * perBoxSft;
  return null;
}

export const purchaseService = {
  async list(dealerId: string, page = 1) {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabase
      .from("purchases")
      .select("*, suppliers(name)", { count: "exact" })
      .eq("dealer_id", dealerId)
      .order("purchase_date", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    return { data: data ?? [], total: count ?? 0 };
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("purchases")
      .select("*, suppliers(name), purchase_items(*, products(name, sku, unit_type, per_box_sft))")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async create(input: CreatePurchaseInput) {
    rateLimits.api("purchase_create");
    // Tenant isolation guard
    await assertDealerId(input.dealer_id);
    // Service-level validation
    validateInput(createPurchaseServiceSchema, input);

    const productIds = input.items.map((i) => i.product_id);
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, unit_type, per_box_sft")
      .in("id", productIds);
    if (pErr) throw new Error(pErr.message);

    const productMap = new Map(products!.map((p) => [p.id, p]));

    const itemsWithCalc = input.items.map((item) => {
      const product = productMap.get(item.product_id);
      const landed = calcLandedCost(item);
      const totalSft = product ? calcTotalSft(item.quantity, product.unit_type, product.per_box_sft) : null;
      return { ...item, landed_cost: landed, total_sft: totalSft };
    });

    const totalAmount = itemsWithCalc.reduce((sum, i) => sum + i.landed_cost, 0);

    const { data: purchase, error: hErr } = await supabase
      .from("purchases")
      .insert({
        dealer_id: input.dealer_id,
        supplier_id: input.supplier_id,
        invoice_number: input.invoice_number || null,
        purchase_date: input.purchase_date,
        total_amount: totalAmount,
        notes: input.notes || null,
        created_by: input.created_by || null,
      })
      .select()
      .single();
    if (hErr) throw new Error(hErr.message);

    const itemRows = itemsWithCalc.map((item) => ({
      purchase_id: purchase!.id,
      dealer_id: input.dealer_id,
      product_id: item.product_id,
      quantity: item.quantity,
      purchase_rate: item.purchase_rate,
      offer_price: item.offer_price,
      transport_cost: item.transport_cost,
      labor_cost: item.labor_cost,
      other_cost: item.other_cost,
      landed_cost: item.landed_cost,
      total_sft: item.total_sft,
      total: item.landed_cost,
    }));

    const { error: iErr } = await supabase.from("purchase_items").insert(itemRows);
    if (iErr) throw new Error(iErr.message);

    for (const item of itemsWithCalc) {
      await stockService.addStock(item.product_id, item.quantity, input.dealer_id);
      const costPerUnit = item.quantity > 0 ? item.landed_cost / item.quantity : 0;
      await stockService.updateAverageCost(item.product_id, input.dealer_id, item.quantity, costPerUnit);
    }

    await supplierLedgerService.addEntry({
      dealer_id: input.dealer_id,
      supplier_id: input.supplier_id,
      purchase_id: purchase!.id,
      type: "purchase",
      amount: -totalAmount,
      description: `Purchase ${input.invoice_number || purchase!.id}`,
      entry_date: input.purchase_date,
    });

    await cashLedgerService.addEntry({
      dealer_id: input.dealer_id,
      type: "purchase",
      amount: -totalAmount,
      description: `Purchase payment: ${input.invoice_number || purchase!.id}`,
      reference_type: "purchases",
      reference_id: purchase!.id,
      entry_date: input.purchase_date,
    });

    await logAudit({
      dealer_id: input.dealer_id,
      user_id: input.created_by,
      action: "purchase_create",
      table_name: "purchases",
      record_id: purchase!.id,
      new_data: {
        supplier_id: input.supplier_id,
        invoice_number: input.invoice_number,
        total_amount: totalAmount,
        item_count: input.items.length,
      },
    });

    return purchase;
  },
};
