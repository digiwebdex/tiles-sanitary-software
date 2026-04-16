import { supabase } from "@/integrations/supabase/client";
import { stockService } from "@/services/stockService";
import { customerLedgerService, cashLedgerService } from "@/services/ledgerService";
import { logAudit } from "@/services/auditService";
import { validateInput, createSaleServiceSchema } from "@/lib/validators";
import { assertDealerId } from "@/lib/tenancy";
import { rateLimits } from "@/lib/rateLimit";
import { notificationService } from "@/services/notificationService";
import { batchService, type FIFOAllocationResult } from "@/services/batchService";
import { consumeReservation } from "@/services/reservationService";

export interface SaleItemInput {
  product_id: string;
  quantity: number;
  sale_rate: number;
  rate_source?: "default" | "tier" | "manual";
  tier_id?: string | null;
  original_resolved_rate?: number | null;
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
  /** If true, allow sale even when stock is insufficient (backorder mode) */
  allow_backorder?: boolean;
  /** If true, user has acknowledged mixed shade/caliber warning */
  mixed_batch_acknowledged?: boolean;
  /** Explicit reservation selections: { product_id → [{ reservation_id, consume_qty }] } */
  reservation_selections?: Record<string, Array<{ reservation_id: string; consume_qty: number }>>;
  /** Optional project link (Project / Site-wise Sales). */
  project_id?: string | null;
  /** Optional delivery site under the chosen project. */
  site_id?: string | null;
}

const PAGE_SIZE = 25;

async function generateInvoiceNumber(dealerId: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_next_invoice_no", {
    _dealer_id: dealerId,
  });
  if (error) {
    const { count } = await supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("dealer_id", dealerId);
    const next = (count ?? 0) + 1;
    return `INV-${String(next).padStart(5, "0")}`;
  }
  return data as string;
}

/**
 * Check if a dealer has backorder mode enabled
 */
async function isDealerBackorderEnabled(dealerId: string): Promise<boolean> {
  const { data } = await supabase
    .from("dealers")
    .select("allow_backorder")
    .eq("id", dealerId)
    .single();
  return (data as any)?.allow_backorder === true;
}

/**
 * Check stock availability for sale items and return shortage info.
 */
export async function checkStockAvailability(
  dealerId: string,
  items: SaleItemInput[]
): Promise<{
  hasShortage: boolean;
  backorderEnabled: boolean;
  itemDetails: Array<{
    product_id: string;
    product_name: string;
    unit_type: string;
    requested: number;
    available: number;
    shortage: number;
  }>;
}> {
  const backorderEnabled = await isDealerBackorderEnabled(dealerId);
  const productIds = items.map(i => i.product_id);

  const [productsRes, stockRes] = await Promise.all([
    supabase.from("products").select("id, name, unit_type").in("id", productIds),
    supabase.from("stock").select("product_id, box_qty, piece_qty, reserved_box_qty, reserved_piece_qty").eq("dealer_id", dealerId).in("product_id", productIds),
  ]);

  const productMap = new Map((productsRes.data ?? []).map(p => [p.id, p]));
  const stockMap = new Map((stockRes.data ?? []).map(s => [s.product_id, s]));

  let hasShortage = false;
  const itemDetails = items.map(item => {
    const product = productMap.get(item.product_id);
    const stock = stockMap.get(item.product_id);
    const unitType = product?.unit_type ?? "piece";
    // Free stock = total - reserved
    const total = unitType === "box_sft"
      ? Number(stock?.box_qty ?? 0)
      : Number(stock?.piece_qty ?? 0);
    const reserved = unitType === "box_sft"
      ? Number((stock as any)?.reserved_box_qty ?? 0)
      : Number((stock as any)?.reserved_piece_qty ?? 0);
    const available = total - reserved;
    const shortage = Math.max(0, item.quantity - available);
    if (shortage > 0) hasShortage = true;

    return {
      product_id: item.product_id,
      product_name: product?.name ?? "Unknown",
      unit_type: unitType,
      requested: item.quantity,
      available,
      shortage,
    };
  });

  return { hasShortage, backorderEnabled, itemDetails };
}

/**
 * Preview batch allocation for sale items (used by UI for mixed-shade warning).
 */
export async function previewBatchAllocation(
  dealerId: string,
  items: SaleItemInput[]
): Promise<{
  has_mixed_shade: boolean;
  has_mixed_caliber: boolean;
  item_allocations: Array<{
    product_id: string;
    product_name: string;
    allocation: FIFOAllocationResult;
  }>;
}> {
  const productIds = items.map(i => i.product_id);
  const { data: products } = await supabase
    .from("products")
    .select("id, name, unit_type")
    .in("id", productIds);
  const productMap = new Map((products ?? []).map(p => [p.id, p]));

  let globalMixedShade = false;
  let globalMixedCaliber = false;
  const itemAllocations = [];

  for (const item of items) {
    if (!item.product_id || !item.quantity) continue;
    const product = productMap.get(item.product_id);
    const unitType = (product?.unit_type ?? "piece") as "box_sft" | "piece";

    const allocation = await batchService.planFIFOAllocation(
      item.product_id, dealerId, item.quantity, unitType
    );

    if (allocation.has_mixed_shade) globalMixedShade = true;
    if (allocation.has_mixed_caliber) globalMixedCaliber = true;

    itemAllocations.push({
      product_id: item.product_id,
      product_name: product?.name ?? "Unknown",
      allocation,
    });
  }

  return {
    has_mixed_shade: globalMixedShade,
    has_mixed_caliber: globalMixedCaliber,
    item_allocations: itemAllocations,
  };
}

export const salesService = {
  async list(dealerId: string, page = 1, search?: string) {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("sales")
      .select("*, customers(name, type, phone, address)", { count: "exact" })
      .eq("dealer_id", dealerId)
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search?.trim()) {
      query = query.or(`invoice_number.ilike.%${search.trim()}%`);
    }

    const { data, error, count } = await query;
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

    // Service-level validation
    validateInput(createSaleServiceSchema, { ...input, customer_id: customerId });

    // Check backorder mode
    const backorderEnabled = input.allow_backorder || await isDealerBackorderEnabled(input.dealer_id);

    // Fetch product details + stock for avg cost
    const productIds = input.items.map((i) => i.product_id);

    const [productsRes, stockRes] = await Promise.all([
      supabase.from("products").select("id, unit_type, per_box_sft").in("id", productIds),
      supabase.from("stock").select("product_id, average_cost_per_unit, box_qty, piece_qty, reserved_box_qty, reserved_piece_qty").eq("dealer_id", input.dealer_id).in("product_id", productIds),
    ]);

    if (productsRes.error) throw new Error(productsRes.error.message);
    if (stockRes.error) throw new Error(stockRes.error.message);

    const productMap = new Map(productsRes.data!.map((p) => [p.id, p]));
    const stockMap = new Map(stockRes.data!.map((s) => [s.product_id, s]));

    let totalBox = 0;
    let totalSft = 0;
    let totalPiece = 0;
    let totalCogs = 0;
    let hasBackorder = false;

    const itemsCalc = input.items.map((item) => {
      const product = productMap.get(item.product_id);
      const stock = stockMap.get(item.product_id);
      const avgCost = stock ? Number(stock.average_cost_per_unit) : 0;
      const unitType = product?.unit_type ?? "piece";
      const perBoxSft = product?.per_box_sft ?? 0;
      let itemTotal: number;
      let itemSft: number | null = null;

      // Calculate available qty (FREE stock = total - reserved)
      const totalQty = unitType === "box_sft"
        ? Number(stock?.box_qty ?? 0)
        : Number(stock?.piece_qty ?? 0);
      const reservedQty = unitType === "box_sft"
        ? Number((stock as any)?.reserved_box_qty ?? 0)
        : Number((stock as any)?.reserved_piece_qty ?? 0);
      const availableQty = totalQty - reservedQty;
      const shortage = Math.max(0, item.quantity - availableQty);

      if (shortage > 0 && !backorderEnabled) {
        throw new Error(
          `Insufficient stock for product. Available: ${availableQty}, Requested: ${item.quantity}. Enable "Allow Sale Below Stock" in dealer settings.`
        );
      }

      if (shortage > 0) {
        hasBackorder = true;
      }

      if (unitType === "box_sft") {
        totalBox += item.quantity;
        itemSft = item.quantity * perBoxSft;
        totalSft += itemSft;
        itemTotal = itemSft * item.sale_rate;
      } else {
        totalPiece += item.quantity;
        itemTotal = item.quantity * item.sale_rate;
      }

      const itemCogs = item.quantity * avgCost;
      totalCogs += itemCogs;

      return {
        ...item,
        total: itemTotal,
        total_sft: itemSft,
        available_qty_at_sale: availableQty,
        backorder_qty: shortage,
        fulfillment_status: shortage > 0 ? "pending" : "in_stock",
      };
    });

    const subtotal = itemsCalc.reduce((s, i) => s + i.total, 0);
    const totalAmount = subtotal - input.discount;
    const dueAmount = totalAmount - input.paid_amount;
    const grossProfit = totalAmount - totalCogs;
    const netProfit = grossProfit;
    const profit = grossProfit;

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
        has_backorder: hasBackorder,
        project_id: input.project_id ?? null,
        site_id: input.site_id ?? null,
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
      available_qty_at_sale: item.available_qty_at_sale,
      backorder_qty: item.backorder_qty,
      allocated_qty: 0,
      fulfillment_status: item.fulfillment_status,
      rate_source: (item as SaleItemInput).rate_source ?? "default",
      tier_id: (item as SaleItemInput).tier_id ?? null,
      original_resolved_rate: (item as SaleItemInput).original_resolved_rate ?? null,
    }));

    const { data: insertedSaleItems, error: iErr } = await supabase
      .from("sale_items")
      .insert(itemRows as any)
      .select("id, product_id");
    if (iErr) throw new Error(iErr.message);

    const saleItemMap = new Map((insertedSaleItems ?? []).map(i => [i.product_id, i.id]));

    // For challan_mode: don't deduct stock or create ledger entries yet
    if (!isChallanMode) {
      // FIFO batch allocation + stock deduction for each item
      // ATOMIC: Each item uses a server-side RPC that locks batch rows,
      // deducts batches, inserts sale_item_batches, and updates aggregate stock
      // in a single DB transaction. On failure, the entire transaction rolls back.
      for (const item of itemsCalc) {
        const deductQty = Math.min(item.quantity, item.available_qty_at_sale);
        if (deductQty <= 0) continue;

        const product = productMap.get(item.product_id);
        const unitType = (product?.unit_type ?? "piece") as "box_sft" | "piece";
        const perBoxSft = product?.per_box_sft ?? null;
        const saleItemId = saleItemMap.get(item.product_id);

        if (saleItemId) {
          // Pass customer ID so FIFO respects their reservations
          const allocation = await batchService.planFIFOAllocation(
            item.product_id, input.dealer_id, deductQty, unitType, customerId
          );

          if (allocation.allocations.length > 0) {
            // Atomic: batch deduction + sale_item_batches + aggregate stock in one transaction
            await batchService.executeSaleAllocation(
              saleItemId, input.dealer_id, item.product_id, allocation.allocations, unitType, perBoxSft
            );
          } else {
            // Legacy/unbatched product: deduct aggregate stock only (atomic RPC)
            await batchService.deductStockUnbatched(item.product_id, input.dealer_id, deductQty, unitType, perBoxSft);
          }

          // Consume reservations if explicitly selected
          const reservationSelections = input.reservation_selections?.[item.product_id];
          if (reservationSelections && reservationSelections.length > 0) {
            for (const sel of reservationSelections) {
              await consumeReservation(sel.reservation_id, input.dealer_id, saleItemId, sel.consume_qty);
            }
          }
        } else {
          // Fallback: deduct aggregate stock
          await stockService.deductStock(item.product_id, deductQty, input.dealer_id);
        }
      }

      await customerLedgerService.addEntry({
        dealer_id: input.dealer_id,
        customer_id: customerId,
        sale_id: sale!.id,
        type: "sale",
        amount: totalAmount,
        description: `Sale ${invoiceNumber}${hasBackorder ? " (Backorder)" : ""}`,
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
        has_backorder: hasBackorder,
        backorder_items: itemsCalc.filter(i => i.backorder_qty > 0).map(i => ({
          product_id: i.product_id,
          backorder_qty: i.backorder_qty,
        })),
      },
    });

    // Auto-create challan record linked to sale
    const { data: challanNoData, error: challanNoErr } = await supabase.rpc("generate_next_challan_no", {
      _dealer_id: input.dealer_id,
    });
    const challanNo = challanNoErr
      ? `CH-${String(Date.now()).slice(-5)}`
      : (challanNoData as string);

    await supabase
      .from("challans")
      .insert({
        dealer_id: input.dealer_id,
        sale_id: sale!.id,
        challan_no: challanNo,
        challan_date: input.sale_date,
        status: "pending",
        delivery_status: "pending",
        created_by: input.created_by || null,
        show_price: false,
      } as any);

    // Fire-and-forget notifications
    void (async () => {
      try {
        const { data: customer } = await supabase
          .from("customers")
          .select("name, phone")
          .eq("id", customerId)
          .single();

        const productIds = input.items.map(i => i.product_id);
        const { data: products } = await supabase
          .from("products")
          .select("id, name, unit_type")
          .in("id", productIds);
        const prodMap = new Map((products ?? []).map(p => [p.id, p]));

        const itemDetails = input.items.map(item => {
          const prod = prodMap.get(item.product_id);
          return {
            name: prod?.name ?? "Product",
            quantity: item.quantity,
            unit: prod?.unit_type === "box_sft" ? "box" : "pc",
            rate: item.sale_rate,
            total: item.quantity * item.sale_rate,
          };
        });

        const { data: dealer } = await supabase
          .from("dealers")
          .select("name")
          .eq("id", input.dealer_id)
          .single();

        notificationService.notifySaleCreated(input.dealer_id, {
          invoice_number: invoiceNumber,
          customer_name: customer?.name ?? "Customer",
          customer_phone: customer?.phone ?? null,
          total_amount: totalAmount,
          paid_amount: input.paid_amount,
          due_amount: dueAmount,
          sale_date: input.sale_date,
          sale_id: sale!.id,
          items: itemDetails,
          dealer_name: dealer?.name ?? "",
        });
      } catch {
        // Swallow
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
      .select("*, sale_items(id, product_id, quantity)")
      .eq("id", saleId)
      .single();
    if (fetchErr || !oldSale) throw new Error("Sale not found");

    const oldItems = (oldSale as any).sale_items ?? [];
    const oldCustomerId = oldSale.customer_id;
    const oldPaidAmount = Number(oldSale.paid_amount);

    // 2. Restore old stock + batch allocations
    // Atomic RPC restores batch portion + its aggregate stock.
    // For unbatched items (legacy), restore aggregate stock separately.
    for (const item of oldItems) {
      const product = await supabase.from("products").select("unit_type, per_box_sft").eq("id", item.product_id).single();
      const unitType = (product.data?.unit_type ?? "piece") as "box_sft" | "piece";
      const perBoxSft = product.data?.per_box_sft ?? null;

      // Check how much was batch-allocated before restoring
      const { data: batchAllocs } = await supabase
        .from("sale_item_batches")
        .select("allocated_qty")
        .eq("sale_item_id", item.id);
      const batchAllocated = (batchAllocs ?? []).reduce((s: number, a: any) => s + Number(a.allocated_qty), 0);

      // Restore batch allocations atomically (handles batch + aggregate for batched portion)
      await batchService.restoreBatchAllocations(item.id, item.product_id, input.dealer_id, unitType, perBoxSft);

      // Restore unbatched portion of aggregate stock
      const unbatchedQty = Number(item.quantity) - batchAllocated;
      if (unbatchedQty > 0) {
        await stockService.restoreStock(item.product_id, unbatchedQty, input.dealer_id);
      }
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
      rate_source: (item as SaleItemInput).rate_source ?? "default",
      tier_id: (item as SaleItemInput).tier_id ?? null,
    }));
    const { data: insertedItems, error: iErr } = await supabase
      .from("sale_items")
      .insert(itemRows)
      .select("id, product_id");
    if (iErr) throw new Error(iErr.message);

    const saleItemMap = new Map((insertedItems ?? []).map(i => [i.product_id, i.id]));

    // 9. Deduct new stock + batch allocation
    for (const item of input.items) {
      const product = productMap.get(item.product_id);
      const unitType = (product?.unit_type ?? "piece") as "box_sft" | "piece";
      const perBoxSft = product?.per_box_sft ?? null;
      const saleItemId = saleItemMap.get(item.product_id);

      // Atomic FIFO batch allocation
      if (saleItemId) {
        const allocation = await batchService.planFIFOAllocation(
          item.product_id, input.dealer_id, item.quantity, unitType
        );
        if (allocation.allocations.length > 0) {
          await batchService.executeSaleAllocation(
            saleItemId, input.dealer_id, item.product_id, allocation.allocations, unitType, perBoxSft
          );
        } else {
          await batchService.deductStockUnbatched(item.product_id, input.dealer_id, item.quantity, unitType, perBoxSft);
        }
      } else {
        await stockService.deductStock(item.product_id, item.quantity, input.dealer_id);
      }
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

  /**
   * Cancel/delete a sale with full atomic reversal of stock, ledger, and related records.
   * Blocks if sale is delivered or has deliveries.
   */
  async cancelSale(saleId: string, dealerId: string) {
    await assertDealerId(dealerId);

    // 1. Fetch full sale with items and related records
    const { data: sale, error: fetchErr } = await supabase
      .from("sales")
      .select("*, sale_items(id, product_id, quantity, backorder_qty, available_qty_at_sale, allocated_qty, fulfillment_status)")
      .eq("id", saleId)
      .eq("dealer_id", dealerId)
      .single();
    if (fetchErr || !sale) throw new Error("Sale not found");

    const saleStatus = (sale as any).sale_status;
    const saleType = (sale as any).sale_type;

    // 2. Check if delivered — block deletion
    const { data: challans } = await supabase
      .from("challans")
      .select("id, status, delivery_status")
      .eq("sale_id", saleId)
      .eq("dealer_id", dealerId);

    const hasDelivered = (challans ?? []).some(
      (c: any) => c.delivery_status === "delivered" || c.status === "delivered"
    );
    if (hasDelivered) throw new Error("Cannot delete a sale that has been delivered");

    // 3. Check for existing deliveries
    const { count: deliveryCount } = await supabase
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("sale_id", saleId)
      .eq("dealer_id", dealerId);
    if ((deliveryCount ?? 0) > 0) throw new Error("Cannot delete a sale with existing deliveries");

    // 4. Check if payment received
    if (Number(sale.paid_amount) > 0 && saleStatus === "invoiced") {
      throw new Error("Cannot delete a sale with payments recorded. Record a sales return instead.");
    }

    const items = (sale as any).sale_items ?? [];

    // 5. Restore batch allocations atomically + handle unbatched remainder
    for (const item of items) {
      const { data: product } = await supabase.from("products").select("unit_type, per_box_sft").eq("id", item.product_id).single();
      const unitType = (product?.unit_type ?? "piece") as "box_sft" | "piece";
      const perBoxSft = product?.per_box_sft ?? null;

      // Check batch-allocated amount before restoring (RPC deletes these records)
      const { data: batchAllocs } = await supabase
        .from("sale_item_batches")
        .select("allocated_qty")
        .eq("sale_item_id", item.id);
      const batchAllocated = (batchAllocs ?? []).reduce((s: number, a: any) => s + Number(a.allocated_qty), 0);

      // Atomic: restore batch quantities + aggregate stock for batched portion
      await batchService.restoreBatchAllocations(item.id, item.product_id, dealerId, unitType, perBoxSft);

      // Restore unbatched portion separately
      const deductedQty = Math.min(Number(item.quantity), Number(item.available_qty_at_sale || item.quantity));
      const unbatchedQty = deductedQty - batchAllocated;
      if (unbatchedQty > 0) {
        await stockService.restoreStock(item.product_id, unbatchedQty, dealerId);
      }
    }

    // 6. Reverse reserved stock for challan-mode sales
    if (saleType === "challan_mode" && (saleStatus === "challan_created" || saleStatus === "delivered")) {
      for (const item of items) {
        await stockService.unreserveStock(item.product_id, Number(item.quantity), dealerId);
      }
    }

    // 7. Delete backorder allocations for this sale
    const saleItemIds = items.map((i: any) => i.id).filter(Boolean);
    if (saleItemIds.length > 0) {
      await supabase.from("backorder_allocations").delete().in("sale_item_id", saleItemIds);
    }

    // 8. Delete sale_item_batches (cleanup, should already be done by restoreBatchAllocations)
    if (saleItemIds.length > 0) {
      await supabase.from("sale_item_batches").delete().in("sale_item_id", saleItemIds);
    }

    // 9. Delete ledger entries for this sale
    await supabase.from("customer_ledger").delete().eq("sale_id", saleId).eq("dealer_id", dealerId);
    await supabase.from("cash_ledger").delete().eq("reference_id", saleId).eq("dealer_id", dealerId);

    // 10. Cancel related challans
    for (const ch of (challans ?? [])) {
      if ((ch as any).status !== "cancelled") {
        await supabase.from("challans").update({ status: "cancelled" } as any).eq("id", ch.id);
      }
    }

    // 11. Delete sale items
    await supabase.from("sale_items").delete().eq("sale_id", saleId);

    // 12. Delete sale record
    const { error: delErr } = await supabase.from("sales").delete().eq("id", saleId);
    if (delErr) throw new Error(delErr.message);

    // 13. Audit log
    await logAudit({
      dealer_id: dealerId,
      action: "sale_cancel_delete",
      table_name: "sales",
      record_id: saleId,
      old_data: {
        invoice_number: sale.invoice_number,
        total_amount: Number(sale.total_amount),
        customer_id: sale.customer_id,
        items_reversed: items.length,
        had_backorder: (sale as any).has_backorder,
      },
    });
  },
};
