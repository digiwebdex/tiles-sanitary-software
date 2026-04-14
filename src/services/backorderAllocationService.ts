import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";

/**
 * Backorder Allocation Service
 * 
 * Handles FIFO allocation of newly received stock to pending backorder sale items.
 * Called automatically after purchase stock is added.
 * 
 * Fulfillment status flow:
 *   in_stock            → no shortage at sale time
 *   pending             → backorder exists, nothing allocated yet
 *   partially_allocated → some stock allocated from purchases, not all
 *   ready_for_delivery  → all backorder qty allocated, awaiting delivery
 *   partially_delivered → some delivered, some still pending
 *   fulfilled           → fully delivered, no pending quantity
 *   cancelled           → cancelled safely
 */

export type FulfillmentStatus =
  | "in_stock"
  | "pending"
  | "partially_allocated"
  | "ready_for_delivery"
  | "partially_delivered"
  | "fulfilled"
  | "cancelled";

export function computeFulfillmentStatus(
  quantity: number,
  backorderQty: number,
  allocatedQty: number
): FulfillmentStatus {
  // No shortage at sale time
  if (backorderQty <= 0) return "in_stock";
  // Has shortage, nothing allocated
  if (allocatedQty <= 0) return "pending";
  // Fully allocated
  if (allocatedQty >= backorderQty) return "ready_for_delivery";
  // Partial
  return "partially_allocated";
}

/** Map of status to user-friendly labels */
export const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  in_stock: "In Stock",
  pending: "Backordered",
  partially_allocated: "Partially Allocated",
  ready_for_delivery: "Ready for Delivery",
  partially_delivered: "Partially Delivered",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

export const FULFILLMENT_STATUS_COLORS: Record<string, string> = {
  in_stock: "text-green-600",
  pending: "text-red-600",
  partially_allocated: "text-amber-600",
  ready_for_delivery: "text-blue-600",
  partially_delivered: "text-orange-600",
  fulfilled: "text-green-700",
  cancelled: "text-muted-foreground",
};

export const backorderAllocationService = {
  /**
   * Allocate newly received stock to pending backorders for a product (FIFO).
   * Called after purchaseService.create() adds stock.
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
             !["in_stock", "fulfilled", "ready_for_delivery"].includes(i.fulfillment_status)
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

  /**
   * Get backorder summary for dashboard/reports.
   */
  async getBackorderSummary(dealerId: string) {
    const { data, error } = await supabase
      .from("sale_items")
      .select("id, product_id, quantity, backorder_qty, allocated_qty, fulfillment_status, sale_id, sale_rate, products(name, sku, unit_type), sales(invoice_number, sale_date, customer_id, customers(name))")
      .eq("dealer_id", dealerId)
      .gt("backorder_qty", 0)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /**
   * Get pending fulfillment items (allocated but not delivered).
   */
  async getPendingFulfillment(dealerId: string) {
    const { data, error } = await supabase
      .from("sale_items")
      .select("id, product_id, quantity, backorder_qty, allocated_qty, fulfillment_status, sale_id, products(name, sku, unit_type), sales(invoice_number, sale_date, customer_id, customers(name))")
      .eq("dealer_id", dealerId)
      .in("fulfillment_status", ["pending", "partially_allocated", "ready_for_delivery", "partially_delivered"])
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /**
   * Get shortage demand report: products with pending backorder demand.
   */
  async getShortageDemandReport(dealerId: string) {
    const { data, error } = await supabase
      .from("sale_items")
      .select("product_id, backorder_qty, allocated_qty, products(name, sku, unit_type, brand)")
      .eq("dealer_id", dealerId)
      .gt("backorder_qty", 0);

    if (error) throw new Error(error.message);

    // Aggregate by product
    const productMap = new Map<string, { name: string; sku: string; unit_type: string; brand: string; totalShortage: number; totalAllocated: number; pendingCount: number }>();
    for (const item of data ?? []) {
      const pid = item.product_id;
      const existing = productMap.get(pid);
      const product = item.products as any;
      if (existing) {
        existing.totalShortage += Number(item.backorder_qty);
        existing.totalAllocated += Number(item.allocated_qty);
        existing.pendingCount++;
      } else {
        productMap.set(pid, {
          name: product?.name ?? "Unknown",
          sku: product?.sku ?? "",
          unit_type: product?.unit_type ?? "piece",
          brand: product?.brand ?? "—",
          totalShortage: Number(item.backorder_qty),
          totalAllocated: Number(item.allocated_qty),
          pendingCount: 1,
        });
      }
    }

    return Array.from(productMap.entries()).map(([id, v]) => ({
      product_id: id,
      ...v,
      unfulfilledQty: v.totalShortage - v.totalAllocated,
    })).sort((a, b) => b.unfulfilledQty - a.unfulfilledQty);
  },

  /**
   * Get dashboard stats for backorder widgets.
   */
  async getDashboardStats(dealerId: string) {
    const { data, error } = await supabase
      .from("sale_items")
      .select("fulfillment_status, backorder_qty, allocated_qty, product_id, sale_id")
      .eq("dealer_id", dealerId)
      .neq("fulfillment_status", "in_stock")
      .neq("fulfillment_status", "fulfilled")
      .neq("fulfillment_status", "cancelled");

    if (error) return { totalBackorders: 0, pendingFulfillment: 0, readyForDelivery: 0 };

    const items = data ?? [];
    const totalBackorders = items.filter(i => Number(i.backorder_qty) > 0).length;
    const pendingFulfillment = items.filter(i => ["pending", "partially_allocated", "partially_delivered"].includes(i.fulfillment_status)).length;
    const readyForDelivery = items.filter(i => i.fulfillment_status === "ready_for_delivery").length;

    return { totalBackorders, pendingFulfillment, readyForDelivery };
  },
};
