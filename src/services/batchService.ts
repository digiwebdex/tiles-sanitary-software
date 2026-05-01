/**
 * Batch Service — VPS-era reduced surface (Phase 3U-26).
 *
 * Mutation wrappers removed (now performed atomically inside VPS routes):
 *   - findOrCreateBatch        → handled by POST /api/purchases (Phase 3K)
 *   - executeSaleAllocation    → handled by POST /api/sales (Phase 3L) via
 *                                allocate_sale_batches RPC server-side
 *   - restoreBatchAllocations  → handled by PUT/DELETE /api/sales/:id (3M)
 *                                via restore_sale_batches RPC server-side
 *   - deductStockUnbatched     → handled inside VPS sale create / adjust
 *
 * Read-only helpers retained:
 *   - planFIFOAllocation: client-side preview used by SaleForm to surface
 *     mixed shade/caliber warnings before submitting. Reads product_batches
 *     and stock_reservations under dealer-scoped RLS — safe.
 *   - getActiveBatches / getAllBatches: legacy listing helpers.
 */
import { supabase } from "@/integrations/supabase/client";

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
 * Format: AUTO-YYYYMMDD-XXXXX (random 5-char alphanumeric suffix).
 * Kept exported for legacy form helpers; safe to call from anywhere.
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

export const batchService = {
  generateAutoBatchNo,

  /**
   * FIFO allocation preview (read-only).
   *
   * Free qty = batch total – reserved (+ caller's own reservations if
   * skipReservedForCustomer is set). Returns an allocation plan without
   * mutating any data.
   */
  async planFIFOAllocation(
    productId: string,
    dealerId: string,
    requestedQty: number,
    unitType: "box_sft" | "piece",
    skipReservedForCustomer?: string,
  ): Promise<FIFOAllocationResult> {
    const batches = await this.getActiveBatches(productId, dealerId);

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
          (batchReservationMap.get(r.batch_id) ?? 0) + remaining,
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

      const customerReservedOnBatch = batchReservationMap.get(batch.id) ?? 0;
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
};
