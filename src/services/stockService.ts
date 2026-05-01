/**
 * Stock Service — VPS-only (Phase 3U-26).
 *
 * All write paths now route to the VPS atomic adjustment endpoints
 * (POST /api/adjustments/{add|deduct|restore|broken}).
 *
 * Removed (dead code with zero callers in src/ as of 3U-26):
 *   - reserveStock / unreserveStock / deductReservedStock — these legacy
 *     helpers are superseded by VPS challan + delivery endpoints (Phase 3O)
 *     which perform reservation logic atomically server-side.
 *   - updateAverageCost — moved into the VPS purchase-create transaction
 *     (Phase 3K) and never invoked from the client.
 *   - applyStockChange / computeStockUpdate / getOrCreateStock — local
 *     fallback path for the old USE_VPS=false branch (no longer reachable
 *     because env.AUTH_BACKEND is forced to "vps" on every prod/preview host).
 *
 * Kept:
 *   - getAvailableQty: read-only helper used by sale form previews.
 *   - deductStockWithBackorder: legacy wrapper kept for any in-flight callers
 *     (none today, but preserved as a thin VPS shim until a follow-up audit).
 */
import { supabase } from "@/integrations/supabase/client";
import { validateInput, stockAdjustmentServiceSchema } from "@/lib/validators";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

async function vpsAdjustment(
  type: "add" | "deduct" | "restore" | "broken",
  body: Record<string, unknown>,
) {
  const res = await vpsAuthedFetch(`/api/adjustments/${type}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (data as any)?.error || `Stock adjustment failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
}

interface StockProduct {
  id: string;
  unit_type: "box_sft" | "piece";
  per_box_sft: number | null;
}

/**
 * Read product unit metadata (unit_type, per_box_sft) for client-side previews.
 * Read-only; safe to use on either backend.
 */
async function getProduct(productId: string): Promise<StockProduct> {
  const { data, error } = await supabase
    .from("products")
    .select("id, unit_type, per_box_sft")
    .eq("id", productId)
    .single();

  if (error || !data) throw new Error(`Product not found: ${productId}`);
  return data as StockProduct;
}

/**
 * Get currently available stock for a product (preview helper).
 * Reads aggregated stock row directly. Reservation overlay handled by
 * batchService.planFIFOAllocation when needed.
 */
async function getAvailableQty(productId: string, dealerId: string): Promise<number> {
  const product = await getProduct(productId);
  const { data } = await supabase
    .from("stock")
    .select("box_qty, piece_qty")
    .eq("product_id", productId)
    .eq("dealer_id", dealerId)
    .maybeSingle();

  if (!data) return 0;
  return product.unit_type === "box_sft"
    ? Number(data.box_qty ?? 0)
    : Number(data.piece_qty ?? 0);
}

/**
 * Deduct with backorder awareness.
 * Wraps the VPS deduct endpoint; falls back to "all backordered" if
 * available qty is 0. Kept for backward compatibility — no current callers.
 */
async function deductStockWithBackorder(
  productId: string,
  requestedQty: number,
  dealerId: string,
): Promise<{ deducted: number; backordered: number; availableAtSale: number }> {
  if (requestedQty <= 0) throw new Error("Quantity must be positive");
  const available = await getAvailableQty(productId, dealerId);
  const deductible = Math.min(available, requestedQty);
  const backordered = Math.max(0, requestedQty - available);

  if (deductible > 0) {
    await vpsAdjustment("deduct", {
      dealer_id: dealerId,
      product_id: productId,
      quantity: deductible,
    });
  }
  return { deducted: deductible, backordered, availableAtSale: available };
}

export const stockService = {
  addStock: (productId: string, quantity: number, dealerId: string) =>
    vpsAdjustment("add", { dealer_id: dealerId, product_id: productId, quantity }),

  deductStock: (productId: string, quantity: number, dealerId: string) =>
    vpsAdjustment("deduct", { dealer_id: dealerId, product_id: productId, quantity }),

  restoreStock: (productId: string, quantity: number, dealerId: string) =>
    vpsAdjustment("restore", { dealer_id: dealerId, product_id: productId, quantity }),

  adjustStock: (
    productId: string,
    quantity: number,
    type: "add" | "deduct",
    dealerId: string,
  ) => {
    validateInput(stockAdjustmentServiceSchema, {
      product_id: productId,
      dealer_id: dealerId,
      quantity,
      type,
    });
    return vpsAdjustment(type, { dealer_id: dealerId, product_id: productId, quantity });
  },

  deductBrokenStock: (productId: string, quantity: number, dealerId: string, reason: string) => {
    if (quantity <= 0) throw new Error("Quantity must be positive");
    return vpsAdjustment("broken", {
      dealer_id: dealerId,
      product_id: productId,
      quantity,
      reason,
    });
  },

  getAvailableQty,
  deductStockWithBackorder,
};
