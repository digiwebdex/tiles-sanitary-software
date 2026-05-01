/**
 * Batch Service — VPS-only (Phase 3U-27).
 *
 * All mutation paths run inside VPS routes:
 *   - findOrCreateBatch        → POST /api/purchases (3K)
 *   - executeSaleAllocation    → POST /api/sales (3L) → allocate_sale_batches
 *   - restoreBatchAllocations  → PUT/DELETE /api/sales/:id (3M) → restore_sale_batches
 *   - deductStockUnbatched     → handled inside VPS sale create / adjust
 *
 * Phase 3U-27: read helpers (getActiveBatches, getAllBatches,
 * planFIFOAllocation reservation overlay) migrated from Supabase to VPS
 * (/api/batches and /api/reservations/by-customer-product).
 * Zero Supabase imports remain.
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

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

interface BatchRow {
  id: string;
  batch_no: string;
  shade_code: string | null;
  caliber: string | null;
  lot_no: string | null;
  box_qty: number | string;
  piece_qty: number | string;
  reserved_box_qty?: number | string | null;
  reserved_piece_qty?: number | string | null;
  status?: string;
}

interface ReservationRow {
  batch_id: string | null;
  reserved_qty: number | string;
  fulfilled_qty: number | string;
  released_qty: number | string;
}

/**
 * Generate a collision-safe auto batch number.
 * Format: AUTO-YYYYMMDD-XXXXX (random 5-char alphanumeric suffix).
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

async function fetchBatches(
  productId: string,
  dealerId: string,
  opts: { activeOnly: boolean },
): Promise<BatchRow[]> {
  const params = new URLSearchParams({
    dealerId,
    pageSize: "500",
    "f.product_id": productId,
    orderBy: "created_at",
    orderDir: "asc",
  });
  if (opts.activeOnly) params.set("f.status", "active");
  const res = await vpsAuthedFetch(`/api/batches?${params.toString()}`);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Failed to fetch batches (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return ((body as any)?.rows ?? []) as BatchRow[];
}

async function fetchCustomerReservations(
  productId: string,
  dealerId: string,
  customerId: string,
): Promise<ReservationRow[]> {
  // /api/reservations/by-customer-product returns only active rows.
  const params = new URLSearchParams({
    dealerId,
    customerId,
    productId,
  });
  const res = await vpsAuthedFetch(
    `/api/reservations/by-customer-product?${params.toString()}`,
  );
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) return [];
  return ((body as any)?.rows ?? []) as ReservationRow[];
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

    const batchReservationMap = new Map<string, number>();
    if (skipReservedForCustomer) {
      const reservations = await fetchCustomerReservations(
        productId,
        dealerId,
        skipReservedForCustomer,
      );
      for (const r of reservations) {
        if (!r.batch_id) continue;
        const remaining =
          Number(r.reserved_qty) - Number(r.fulfilled_qty) - Number(r.released_qty);
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
        ? Number(batch.reserved_box_qty ?? 0)
        : Number(batch.reserved_piece_qty ?? 0);

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
    return fetchBatches(productId, dealerId, { activeOnly: true });
  },

  async getAllBatches(productId: string, dealerId: string) {
    return fetchBatches(productId, dealerId, { activeOnly: false });
  },
};
