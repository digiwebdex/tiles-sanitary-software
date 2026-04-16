import { supabase } from "@/integrations/supabase/client";

export interface BatchInput {
  dealer_id: string;
  product_id: string;
  batch_no: string;
  lot_no?: string;
  shade_code?: string;
  caliber?: string;
  notes?: string;
}

export interface BatchStockResult {
  batch_id: string;
  is_new: boolean;
}

export interface BatchAllocation {
  batch_id: string;
  batch_no: string;
  shade_code: string | null;
  caliber: string | null;
  lot_no: string | null;
  allocated_qty: number;
}

export interface FIFOAllocationResult {
  allocations: BatchAllocation[];
  unallocated_qty: number;
  has_mixed_shade: boolean;
  has_mixed_caliber: boolean;
  shade_codes: string[];
  calibers: string[];
}

/**
 * Generate a collision-safe auto batch number.
 * Format: AUTO-YYYYMMDD-XXXXX (random 5-char alphanumeric suffix)
 */
function generateAutoBatchNo(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `AUTO-${date}-${suffix}`;
}

/**
 * Find or create a product batch.
 * Merge rule: same product + batch_no + shade + caliber + lot + dealer → top-up existing batch.
 * Different shade/caliber/lot → new batch.
 *
 * NULL-SAFE MATCHING:
 * - null and empty string ("") are treated as equivalent for shade_code, caliber, lot_no
 * - This prevents duplicate batch rows for the same logical identity
 */
export const batchService = {
  generateAutoBatchNo,

  async findOrCreateBatch(
    input: BatchInput,
    quantity: number,
    unitType: "box_sft" | "piece",
    perBoxSft: number | null
  ): Promise<BatchStockResult> {
    const shade = input.shade_code?.trim() || null;
    const caliber = input.caliber?.trim() || null;
    const lotNo = input.lot_no?.trim() || null;
    const batchNo = input.batch_no.trim();

    // Build query with null-safe matching
    let query = supabase
      .from("product_batches")
      .select("id, box_qty, piece_qty, sft_qty, status")
      .eq("dealer_id", input.dealer_id)
      .eq("product_id", input.product_id)
      .eq("batch_no", batchNo);

    // Null-safe: if value is null, match IS NULL; if value exists, match exact
    if (shade !== null) {
      query = query.eq("shade_code", shade);
    } else {
      query = query.is("shade_code", null);
    }

    if (caliber !== null) {
      query = query.eq("caliber", caliber);
    } else {
      query = query.is("caliber", null);
    }

    if (lotNo !== null) {
      query = query.eq("lot_no", lotNo);
    } else {
      query = query.is("lot_no", null);
    }

    const { data: existing } = await query.limit(1);

    if (existing && existing.length > 0) {
      // Top-up existing batch (reactivates if depleted)
      const batch = existing[0];
      const updates = this._calcBatchQtyAdd(batch, quantity, unitType, perBoxSft);

      const { error } = await supabase
        .from("product_batches")
        .update(updates)
        .eq("id", batch.id);

      if (error) throw new Error(`Batch top-up failed: ${error.message}`);

      return { batch_id: batch.id, is_new: false };
    }

    // Create new batch
    const newBatchData: any = {
      dealer_id: input.dealer_id,
      product_id: input.product_id,
      batch_no: batchNo,
      lot_no: lotNo,
      shade_code: shade,
      caliber: caliber,
      notes: input.notes?.trim() || null,
      box_qty: 0,
      piece_qty: 0,
      sft_qty: 0,
      status: "active",
    };

    if (unitType === "box_sft") {
      newBatchData.box_qty = quantity;
      newBatchData.sft_qty = quantity * (perBoxSft ?? 0);
    } else {
      newBatchData.piece_qty = quantity;
    }

    const { data: created, error: cErr } = await supabase
      .from("product_batches")
      .insert(newBatchData)
      .select("id")
      .single();

    if (cErr) throw new Error(`Batch creation failed: ${cErr.message}`);

    return { batch_id: created!.id, is_new: true };
  },

  /**
   * FIFO allocation: allocate requested qty from oldest active batches.
   * Returns allocation plan without modifying data (preview only).
   */
  /**
   * FIFO allocation: allocate requested qty from oldest active batches.
   * Returns allocation plan without modifying data (preview only).
   * 
   * RESERVATION ENFORCEMENT:
   * Free qty = batch total - batch reserved. Only free qty is available
   * for FIFO allocation. Reserved stock is protected for the holding customer.
   * 
   * If skipReservedForCustomer is provided, that customer's reservations
   * are excluded from the "reserved" deduction (they own those holds).
   */
  async planFIFOAllocation(
    productId: string,
    dealerId: string,
    requestedQty: number,
    unitType: "box_sft" | "piece",
    skipReservedForCustomer?: string
  ): Promise<FIFOAllocationResult> {
    const batches = await this.getActiveBatches(productId, dealerId);

    // LEGACY STOCK RULE:
    // If zero active batches exist for this product, return empty allocations.
    // The caller (salesService) will fall back to aggregate-only stock deduction
    // via deduct_stock_unbatched RPC. No batch records are created retroactively.
    if (batches.length === 0) {
      return {
        allocations: [],
        unallocated_qty: requestedQty,
        has_mixed_shade: false,
        has_mixed_caliber: false,
        shade_codes: [],
        calibers: [],
      };
    }

    // If we need to account for customer-specific reservation offsets,
    // fetch active reservations for this product
    let batchReservationMap = new Map<string, number>();
    if (skipReservedForCustomer) {
      const { data: reservations } = await supabase
        .from("stock_reservations")
        .select("batch_id, reserved_qty, fulfilled_qty, released_qty")
        .eq("product_id", productId)
        .eq("dealer_id", dealerId)
        .eq("customer_id", skipReservedForCustomer)
        .eq("status", "active");
      
      for (const r of reservations ?? []) {
        if (!r.batch_id) continue;
        const remaining = Number(r.reserved_qty) - Number(r.fulfilled_qty) - Number(r.released_qty);
        batchReservationMap.set(
          r.batch_id,
          (batchReservationMap.get(r.batch_id) ?? 0) + remaining
        );
      }
    }

    const allocations: BatchAllocation[] = [];
    let remaining = requestedQty;
    const shadeSet = new Set<string>();
    const caliberSet = new Set<string>();

    for (const batch of batches) {
      if (remaining <= 0) break;

      const totalQty = unitType === "box_sft"
        ? Number(batch.box_qty)
        : Number(batch.piece_qty);

      const reservedQty = unitType === "box_sft"
        ? Number((batch as any).reserved_box_qty ?? 0)
        : Number((batch as any).reserved_piece_qty ?? 0);

      // Customer's own reservation on this batch — treat as available to them
      const customerReservedOnBatch = batchReservationMap.get(batch.id) ?? 0;

      // Free qty = total - reserved + customer's own holds (they can use their own reserved stock)
      const freeQty = totalQty - reservedQty + customerReservedOnBatch;

      if (freeQty <= 0) continue;

      const allocateQty = Math.min(remaining, freeQty);
      allocations.push({
        batch_id: batch.id,
        batch_no: batch.batch_no,
        shade_code: batch.shade_code,
        caliber: batch.caliber,
        lot_no: batch.lot_no,
        allocated_qty: allocateQty,
      });

      if (batch.shade_code) shadeSet.add(batch.shade_code);
      if (batch.caliber) caliberSet.add(batch.caliber);

      remaining -= allocateQty;
    }

    return {
      allocations,
      unallocated_qty: Math.max(0, remaining),
      has_mixed_shade: shadeSet.size > 1,
      has_mixed_caliber: caliberSet.size > 1,
      shade_codes: Array.from(shadeSet),
      calibers: Array.from(caliberSet),
    };
  },

  /**
   * Execute batch allocation ATOMICALLY via server-side DB function.
   * Transaction boundary: the allocate_sale_batches RPC.
   * Inside: batch deduction (FOR UPDATE lock) → sale_item_batches insert → aggregate stock update → sale_item.allocated_qty update.
   * On failure: entire transaction rolls back — no partial state.
   */
  async executeSaleAllocation(
    saleItemId: string,
    dealerId: string,
    productId: string,
    allocations: BatchAllocation[],
    unitType: "box_sft" | "piece",
    perBoxSft: number | null
  ): Promise<void> {
    if (allocations.length === 0) return;

    const { error } = await supabase.rpc("allocate_sale_batches", {
      _dealer_id: dealerId,
      _sale_item_id: saleItemId,
      _product_id: productId,
      _unit_type: unitType,
      _per_box_sft: perBoxSft ?? 0,
      _allocations: allocations.map(a => ({
        batch_id: a.batch_id,
        allocated_qty: a.allocated_qty,
      })),
    });

    if (error) throw new Error(`Atomic batch allocation failed: ${error.message}`);
  },

  /**
   * Restore batch quantities ATOMICALLY via server-side DB function.
   * Used for sale cancellation/edit reversal.
   * Transaction: restore_sale_batches RPC.
   * Inside: batch qty restore (FOR UPDATE lock) → delete sale_item_batches → aggregate stock restore.
   * On failure: entire transaction rolls back.
   */
  async restoreBatchAllocations(
    saleItemId: string,
    productId: string,
    dealerId: string,
    unitType: "box_sft" | "piece",
    perBoxSft: number | null
  ): Promise<void> {
    const { error } = await supabase.rpc("restore_sale_batches", {
      _sale_item_id: saleItemId,
      _product_id: productId,
      _dealer_id: dealerId,
      _unit_type: unitType,
      _per_box_sft: perBoxSft ?? 0,
    });

    if (error) throw new Error(`Atomic batch restoration failed: ${error.message}`);
  },

  /**
   * Deduct aggregate stock only (no batch involvement).
   * Used for legacy/unbatched products.
   */
  async deductStockUnbatched(
    productId: string,
    dealerId: string,
    quantity: number,
    unitType: "box_sft" | "piece",
    perBoxSft: number | null
  ): Promise<void> {
    const { error } = await supabase.rpc("deduct_stock_unbatched", {
      _product_id: productId,
      _dealer_id: dealerId,
      _unit_type: unitType,
      _per_box_sft: perBoxSft ?? 0,
      _quantity: quantity,
    });

    if (error) throw new Error(`Unbatched stock deduction failed: ${error.message}`);
  },

  /**
   * Get all active batches for a product, ordered oldest first (FIFO).
   */
  async getActiveBatches(productId: string, dealerId: string) {
    const { data, error } = await supabase
      .from("product_batches")
      .select("*")
      .eq("product_id", productId)
      .eq("dealer_id", dealerId)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Failed to fetch batches: ${error.message}`);
    return data ?? [];
  },

  /**
   * Get all batches (including depleted) for a product.
   */
  async getAllBatches(productId: string, dealerId: string) {
    const { data, error } = await supabase
      .from("product_batches")
      .select("*")
      .eq("product_id", productId)
      .eq("dealer_id", dealerId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Failed to fetch batches: ${error.message}`);
    return data ?? [];
  },

  _calcBatchQtyAdd(
    current: { box_qty: number; piece_qty: number; sft_qty: number },
    quantity: number,
    unitType: "box_sft" | "piece",
    perBoxSft: number | null
  ) {
    if (unitType === "box_sft") {
      const newBox = Number(current.box_qty) + quantity;
      return {
        box_qty: newBox,
        sft_qty: newBox * (perBoxSft ?? 0),
        status: "active",
      };
    }
    return {
      piece_qty: Number(current.piece_qty) + quantity,
      status: "active",
    };
  },
};
