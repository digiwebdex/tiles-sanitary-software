import { supabase } from "@/integrations/supabase/client";
import { stockService } from "@/services/stockService";
import { customerLedgerService, cashLedgerService } from "@/services/ledgerService";
import { logAudit } from "@/services/auditService";
import { validateInput, createSaleServiceSchema } from "@/lib/validators";
import { assertDealerId } from "@/lib/tenancy";
import { rateLimits } from "@/lib/rateLimit";
import { notificationService } from "@/services/notificationService";

export interface SaleItemInput {
  product_id: string;
  quantity: number;
  sale_rate: number;
}

export interface CreateSaleInput {
  dealer_id: string;
  customer_name: string;
  sale_date: string;
  sale_type?: "direct_invoice" | "challan_mode";
  discount: number;
  discount_reference: string;
  client_reference: string;
  fitter_reference: string;
  paid_amount: number;
  payment_mode?: string;
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
      .order("created_at", { ascending: false })
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
    rateLimits.api("sale_create");
    await assertDealerId(input.dealer_id);

    // Find or create customer by name
    const customerName = input.customer_name.trim();
    let customerId: string;
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("dealer_id", input.dealer_id)
      .ilike("name", customerName)
      .limit(1)
      .maybeSingle();

    if (existing) {
      customerId = existing.id;
    } else {
      const { data: created, error: cErr } = await supabase
        .from("customers")
        .insert({ dealer_id: input.dealer_id, name: customerName, type: "customer" as const, status: "active" })
        .select("id")
        .single();
      if (cErr) throw new Error(cErr.message);
      customerId = created!.id;
    }

    // Service-level validation (validate items etc.)
    validateInput(createSaleServiceSchema, { ...input, customer_id: customerId });

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
      const unitType = product?.unit_type ?? "piece";
      const perBoxSft = product?.per_box_sft ?? 0;
      let itemTotal: number;
      let itemSft: number | null = null;

      if (unitType === "box_sft") {
        totalBox += item.quantity;
        itemSft = item.quantity * perBoxSft;
        totalSft += itemSft;
        // gross = total_sft × sale_rate
        itemTotal = itemSft * item.sale_rate;
      } else {
        totalPiece += item.quantity;
        // gross = piece_qty × sale_rate
        itemTotal = item.quantity * item.sale_rate;
      }

      const itemCogs = item.quantity * avgCost;
      totalCogs += itemCogs;

      return { ...item, total: itemTotal, total_sft: itemSft };
    });

    const subtotal = itemsCalc.reduce((s, i) => s + i.total, 0);
    const totalAmount = subtotal - input.discount;
    const dueAmount = totalAmount - input.paid_amount;
    const grossProfit = totalAmount - totalCogs;
    const netProfit = grossProfit; // transport/labor already baked into landed_cost → COGS
    const profit = grossProfit; // keep legacy field in sync

    const isChallanMode = input.sale_type === "challan_mode";
    const invoiceNumber = await generateInvoiceNumber(input.dealer_id);

    const { data: sale, error: sErr } = await supabase
      .from("sales")
      .insert({
        dealer_id: input.dealer_id,
        customer_id: customerId,
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
        gross_profit: grossProfit,
        net_profit: netProfit,
        total_box: totalBox,
        total_sft: totalSft,
        total_piece: totalPiece,
        notes: input.notes || null,
        payment_mode: input.payment_mode || null,
        created_by: input.created_by || null,
        sale_type: input.sale_type || "direct_invoice",
        sale_status: isChallanMode ? "draft" : "invoiced",
      } as any)
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

    // For challan_mode: don't deduct stock or create ledger entries yet
    if (!isChallanMode) {
      for (const item of input.items) {
        await stockService.deductStock(item.product_id, item.quantity, input.dealer_id);
      }

      await customerLedgerService.addEntry({
        dealer_id: input.dealer_id,
        customer_id: customerId,
        sale_id: sale!.id,
        type: "sale",
        amount: totalAmount,
        description: `Sale ${invoiceNumber}`,
        entry_date: input.sale_date,
      });

      if (input.paid_amount > 0) {
        await customerLedgerService.addEntry({
          dealer_id: input.dealer_id,
          customer_id: customerId,
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
        customer_id: customerId,
        total_amount: totalAmount,
        item_count: input.items.length,
      },
    });

    // Fire-and-forget: notify owner via SMS/Email + customer SMS
    // Non-blocking — sale is already committed; notification failure must never surface to user
    void (async () => {
      try {
        const { data: customer } = await supabase
          .from("customers")
          .select("name, phone")
          .eq("id", customerId)
          .single();
        notificationService.notifySaleCreated(input.dealer_id, {
          invoice_number: invoiceNumber,
          customer_name: customer?.name ?? "Customer",
          customer_phone: customer?.phone ?? null,
          total_amount: totalAmount,
          paid_amount: input.paid_amount,
          due_amount: dueAmount,
          sale_date: input.sale_date,
        });
      } catch {
        // Swallow — notification fetch failure must not surface
      }
    })();

    return sale;
  },

  async update(saleId: string, input: CreateSaleInput) {
    rateLimits.api("sale_update");
    await assertDealerId(input.dealer_id);

    // 1. Fetch existing sale + items for reversal
    const { data: oldSale, error: fetchErr } = await supabase
      .from("sales")
      .select("*, sale_items(product_id, quantity)")
      .eq("id", saleId)
      .single();
    if (fetchErr || !oldSale) throw new Error("Sale not found");

    const oldItems = (oldSale as any).sale_items ?? [];
    const oldCustomerId = oldSale.customer_id;
    const oldPaidAmount = Number(oldSale.paid_amount);

    // 2. Restore old stock
    for (const item of oldItems) {
      await stockService.restoreStock(item.product_id, Number(item.quantity), input.dealer_id);
    }

    // 3. Delete old ledger entries for this sale
    await supabase.from("customer_ledger").delete().eq("sale_id", saleId).eq("dealer_id", input.dealer_id);
    await supabase.from("cash_ledger").delete().eq("reference_id", saleId).eq("dealer_id", input.dealer_id);

    // 4. Delete old sale items
    await supabase.from("sale_items").delete().eq("sale_id", saleId);

    // 5. Find or create customer by name
    const customerName = input.customer_name.trim();
    let customerId: string;
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("dealer_id", input.dealer_id)
      .ilike("name", customerName)
      .limit(1)
      .maybeSingle();

    if (existing) {
      customerId = existing.id;
    } else {
      const { data: created, error: cErr } = await supabase
        .from("customers")
        .insert({ dealer_id: input.dealer_id, name: customerName, type: "customer" as const, status: "active" })
        .select("id")
        .single();
      if (cErr) throw new Error(cErr.message);
      customerId = created!.id;
    }

    // 6. Recalculate totals
    const productIds = input.items.map((i) => i.product_id);
    const [productsRes, stockRes] = await Promise.all([
      supabase.from("products").select("id, unit_type, per_box_sft").in("id", productIds),
      supabase.from("stock").select("product_id, average_cost_per_unit").eq("dealer_id", input.dealer_id).in("product_id", productIds),
    ]);
    if (productsRes.error) throw new Error(productsRes.error.message);
    if (stockRes.error) throw new Error(stockRes.error.message);

    const productMap = new Map(productsRes.data!.map((p) => [p.id, p]));
    const stockMap = new Map(stockRes.data!.map((s) => [s.product_id, s]));

    let totalBox = 0, totalSft = 0, totalPiece = 0, totalCogs = 0;

    const itemsCalc = input.items.map((item) => {
      const product = productMap.get(item.product_id);
      const stock = stockMap.get(item.product_id);
      const avgCost = stock ? Number(stock.average_cost_per_unit) : 0;
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

      totalCogs += item.quantity * avgCost;
      return { ...item, total: itemTotal, total_sft: itemSft };
    });

    const subtotal = itemsCalc.reduce((s, i) => s + i.total, 0);
    const totalAmount = subtotal - input.discount;
    const dueAmount = totalAmount - input.paid_amount;
    const grossProfit = totalAmount - totalCogs;

    // 7. Update sales record
    const { error: sErr } = await supabase
      .from("sales")
      .update({
        customer_id: customerId,
        sale_date: input.sale_date,
        total_amount: totalAmount,
        discount: input.discount,
        discount_reference: input.discount_reference || null,
        client_reference: input.client_reference || null,
        fitter_reference: input.fitter_reference || null,
        paid_amount: input.paid_amount,
        due_amount: dueAmount,
        cogs: totalCogs,
        profit: grossProfit,
        gross_profit: grossProfit,
        net_profit: grossProfit,
        total_box: totalBox,
        total_sft: totalSft,
        total_piece: totalPiece,
        notes: input.notes || null,
        payment_mode: input.payment_mode || null,
      } as any)
      .eq("id", saleId);
    if (sErr) throw new Error(sErr.message);

    // 8. Insert new sale items
    const itemRows = itemsCalc.map((item) => ({
      sale_id: saleId,
      dealer_id: input.dealer_id,
      product_id: item.product_id,
      quantity: item.quantity,
      sale_rate: item.sale_rate,
      total: item.total,
      total_sft: item.total_sft,
    }));
    const { error: iErr } = await supabase.from("sale_items").insert(itemRows);
    if (iErr) throw new Error(iErr.message);

    // 9. Deduct new stock
    for (const item of input.items) {
      await stockService.deductStock(item.product_id, item.quantity, input.dealer_id);
    }

    // 10. Re-create ledger entries
    await customerLedgerService.addEntry({
      dealer_id: input.dealer_id,
      customer_id: customerId,
      sale_id: saleId,
      type: "sale",
      amount: totalAmount,
      description: `Sale ${oldSale.invoice_number} (edited)`,
      entry_date: input.sale_date,
    });

    if (input.paid_amount > 0) {
      await customerLedgerService.addEntry({
        dealer_id: input.dealer_id,
        customer_id: customerId,
        sale_id: saleId,
        type: "payment",
        amount: -input.paid_amount,
        description: `Payment for ${oldSale.invoice_number} (edited)`,
        entry_date: input.sale_date,
      });
      await cashLedgerService.addEntry({
        dealer_id: input.dealer_id,
        type: "receipt",
        amount: input.paid_amount,
        description: `Payment: ${oldSale.invoice_number} (edited)`,
        reference_type: "sales",
        reference_id: saleId,
        entry_date: input.sale_date,
      });
    }

    // 11. Audit log
    await logAudit({
      dealer_id: input.dealer_id,
      action: "sale_update",
      table_name: "sales",
      record_id: saleId,
      old_data: { total_amount: Number(oldSale.total_amount), customer_id: oldCustomerId, paid_amount: oldPaidAmount },
      new_data: { total_amount: totalAmount, customer_id: customerId, paid_amount: input.paid_amount },
    });

    return { id: saleId };
  },
};
