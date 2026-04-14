import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";

/**
 * Backorder Allocation Service
 * 
 * Handles FIFO allocation of newly received stock to pending backorder sale items.
 * Called automatically after purchase stock is added.
 * 
 * Fulfillment status flow:
 *   fulfilled   → stock fully available at sale time (no backorder)
 *   pending     → backorder exists, nothing allocated yet
 *   partially_allocated → some stock allocated from purchases, not all
 *   ready_for_delivery  → all backorder qty allocated, awaiting delivery
 */

export type FulfillmentStatus =
  | "fulfilled"
  | "pending"
  | "partially_allocated"
  | "ready_for_delivery";

function computeFulfillmentStatus(
  quantity: number,
  backorderQty: number,
  allocatedQty: number
): FulfillmentStatus {
  if (backorderQty <= 0) return "fulfilled";
  if (allocatedQty <= 0) return "pending";
  if (allocatedQty >= backorderQty) return "ready_for_delivery";
  return "partially_allocated";
}

export const backorderAllocationService = {
  /**
   * Allocate newly received stock to pending backorders for a product (FIFO).
   * Called after purchaseService.create() adds stock.
   * 
   * @param productId - The product that was restocked
   * @param receivedQty - Quantity received in this purchase
   * @param dealerId - Tenant dealer
   * @param purchaseItemId - The purchase_item record for audit linking
   * @returns Total quantity allocated to backorders
   */
  async allocateNewStock(
    productId: string,
    receivedQty: number,
    dealerId: string,
    purchaseItemId: string
  ): Promise<number> {
    if (receivedQty <= 0) return 0;

    // Find pending backorder sale items for this product, oldest first (FIFO)
    const { data: pendingItems, error: piErr } = await supabase
      .from("sale_items")
      .select("id, quantity, backorder_qty, allocated_qty, sale_id")
      .eq("dealer_id", dealerId)
      .eq("product_id", productId)
      .gt("backorder_qty", 0)
      .order("created_at", { ascending: true }); // FIFO: oldest sale first

    if (piErr) throw new Error(`Failed to fetch pending backorders: ${piErr.message}`);
    if (!pendingItems || pendingItems.length === 0) return 0;

    let remainingToAllocate = receivedQty;
    let totalAllocated = 0;
    const updatedSaleIds = new Set<string>();

    for (const item of pendingItems) {
      if (remainingToAllocate <= 0) break;

      const currentBackorder = Number(item.backorder_qty);
      const currentAllocated = Number(item.allocated_qty);
      const unallocated = currentBackorder - currentAllocated;

      if (unallocated <= 0) continue;

      const allocateNow = Math.min(unallocated, remainingToAllocate);
      const newAllocated = currentAllocated + allocateNow;
      const newBackorderQty = currentBackorder - allocateNow;
      const newStatus = computeFulfillmentStatus(
        Number(item.quantity),
        newBackorderQty,
        newAllocated
      );

      // Update sale_item
      const { error: updateErr } = await supabase
        .from("sale_items")
        .update({
          allocated_qty: newAllocated,
          backorder_qty: newBackorderQty,
          fulfillment_status: newStatus,
        } as any)
        .eq("id", item.id);

      if (updateErr) {
        console.error(`Failed to update sale_item ${item.id}:`, updateErr.message);
        continue;
      }

      // Create allocation record
      await supabase.from("backorder_allocations").insert({
        dealer_id: dealerId,
        product_id: productId,
        sale_item_id: item.id,
        purchase_item_id: purchaseItemId,
        allocated_qty: allocateNow,
      } as any);

      remainingToAllocate -= allocateNow;
      totalAllocated += allocateNow;
      updatedSaleIds.add(item.sale_id);
    }

    // Update has_backorder flag on affected sales
    for (const saleId of updatedSaleIds) {
      await this.updateSaleBackorderFlag(saleId);
    }

    if (totalAllocated > 0) {
      await logAudit({
        dealer_id: dealerId,
        action: "backorder_allocation",
        table_name: "backorder_allocations",
        record_id: purchaseItemId,
        new_data: {
          product_id: productId,
          purchase_item_id: purchaseItemId,
          received_qty: receivedQty,
          total_allocated: totalAllocated,
          remaining_unallocated: remainingToAllocate,
          sales_affected: Array.from(updatedSaleIds),
        },
      });
    }

    return totalAllocated;
  },

  /**
   * Update the has_backorder flag on a sale based on its items' current state.
   */
  async updateSaleBackorderFlag(saleId: string) {
    const { data: items, error } = await supabase
      .from("sale_items")
      .select("backorder_qty, fulfillment_status")
      .eq("sale_id", saleId);

    if (error || !items) return;

    const hasBackorder = items.some(
      (i) => Number(i.backorder_qty) > 0 || 
             (i.fulfillment_status !== "fulfilled" && i.fulfillment_status !== "ready_for_delivery")
    );

    await supabase
      .from("sales")
      .update({ has_backorder: hasBackorder } as any)
      .eq("id", saleId);
  },

  /**
   * Release allocations for a sale item (used on cancel).
   * Returns the total qty that was allocated (to restore to stock if needed).
   */
  async releaseAllocations(saleItemId: string, dealerId: string): Promise<number> {
    const { data: allocations, error } = await supabase
      .from("backorder_allocations")
      .select("id, allocated_qty")
      .eq("sale_item_id", saleItemId)
      .eq("dealer_id", dealerId);

    if (error || !allocations) return 0;

    const totalAllocated = allocations.reduce(
      (sum, a) => sum + Number(a.allocated_qty),
      0
    );

    if (allocations.length > 0) {
      const ids = allocations.map((a) => a.id);
      await supabase.from("backorder_allocations").delete().in("id", ids);
    }

    return totalAllocated;
  },

  /**
   * Get fulfillment summary for a sale's items.
   */
  async getSaleFulfillmentSummary(saleId: string) {
    const { data: items, error } = await supabase
      .from("sale_items")
      .select("id, product_id, quantity, backorder_qty, allocated_qty, fulfillment_status, products(name, sku, unit_type)")
      .eq("sale_id", saleId);

    if (error) throw new Error(error.message);
    return items ?? [];
  },
};
