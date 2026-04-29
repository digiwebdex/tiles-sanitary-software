import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";
import { validateInput, stockAdjustmentServiceSchema } from "@/lib/validators";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

const USE_VPS = env.AUTH_BACKEND === "vps";

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

type AdjustmentType = "add" | "deduct" | "restore";

async function getProduct(productId: string): Promise<StockProduct> {
  const { data, error } = await supabase
    .from("products")
    .select("id, unit_type, per_box_sft")
    .eq("id", productId)
    .single();

  if (error || !data) throw new Error(`Product not found: ${productId}`);
  return data as StockProduct;
}

async function getOrCreateStock(productId: string, dealerId: string) {
  const { data } = await supabase
    .from("stock")
    .select("*")
    .eq("product_id", productId)
    .eq("dealer_id", dealerId)
    .single();

  if (data) return data;

  const { data: created, error } = await supabase
    .from("stock")
    .insert({ product_id: productId, dealer_id: dealerId })
    .select()
    .single();

  if (error) throw new Error(`Failed to create stock record: ${error.message}`);
  return created!;
}

function computeStockUpdate(
  product: StockProduct,
  currentStock: { box_qty: number; sft_qty: number; piece_qty: number },
  quantity: number,
  type: AdjustmentType,
  allowNegative = false
) {
  const sign = type === "deduct" ? -1 : 1;

  if (product.unit_type === "box_sft") {
    const perBoxSft = product.per_box_sft ?? 0;
    const newBoxQty = Number(currentStock.box_qty) + sign * quantity;
    if (newBoxQty < 0 && !allowNegative) throw new Error("Insufficient box stock");
    return {
      box_qty: Math.max(0, newBoxQty),
      sft_qty: Math.max(0, newBoxQty) * perBoxSft,
    };
  }

  // piece
  const newPieceQty = Number(currentStock.piece_qty) + sign * quantity;
  if (newPieceQty < 0 && !allowNegative) throw new Error("Insufficient piece stock");
  return { piece_qty: Math.max(0, newPieceQty) };
}

async function applyStockChange(
  productId: string,
  dealerId: string,
  quantity: number,
  type: AdjustmentType,
  allowNegative = false
) {
  if (quantity <= 0) throw new Error("Quantity must be positive");

  const product = await getProduct(productId);
  const stock = await getOrCreateStock(productId, dealerId);
  const updates = computeStockUpdate(product, stock, quantity, type, allowNegative);

  const { error } = await supabase
    .from("stock")
    .update(updates)
    .eq("product_id", productId)
    .eq("dealer_id", dealerId);

  if (error) throw new Error(`Stock update failed: ${error.message}`);

  // Audit log for every stock change
  await logAudit({
    dealer_id: dealerId,
    action: `stock_${type}`,
    table_name: "stock",
    record_id: stock.id,
    old_data: { box_qty: stock.box_qty, sft_qty: stock.sft_qty, piece_qty: stock.piece_qty },
    new_data: { ...updates, adjustment_type: type, quantity },
  });
}

/**
 * Get available stock quantity for a product.
 * Returns box_qty for box_sft products, piece_qty for piece products.
 */
async function getAvailableQty(productId: string, dealerId: string): Promise<number> {
  const product = await getProduct(productId);
  const stock = await getOrCreateStock(productId, dealerId);

  if (product.unit_type === "box_sft") {
    return Number(stock.box_qty);
  }
  return Number(stock.piece_qty);
}

/**
 * Deduct stock with backorder awareness.
 * Deducts only what's available and returns how much was actually deducted vs backordered.
 */
async function deductStockWithBackorder(
  productId: string,
  requestedQty: number,
  dealerId: string
): Promise<{ deducted: number; backordered: number; availableAtSale: number }> {
  if (requestedQty <= 0) throw new Error("Quantity must be positive");

  const available = await getAvailableQty(productId, dealerId);
  const deductible = Math.min(available, requestedQty);
  const backordered = Math.max(0, requestedQty - available);

  if (deductible > 0) {
    await applyStockChange(productId, dealerId, deductible, "deduct", false);
  }

  return {
    deducted: deductible,
    backordered,
    availableAtSale: available,
  };
}

async function updateAverageCost(
  productId: string,
  dealerId: string,
  newQty: number,
  newCostPerUnit: number
) {
  const stock = await getOrCreateStock(productId, dealerId);
  const product = await getProduct(productId);

  let currentQty: number;
  if (product.unit_type === "box_sft") {
    currentQty = Number(stock.sft_qty);
  } else {
    currentQty = Number(stock.piece_qty);
  }

  const currentTotal = currentQty * Number(stock.average_cost_per_unit);
  const newTotal = newQty * newCostPerUnit;
  const totalQty = currentQty + newQty;
  const avgCost = totalQty > 0 ? (currentTotal + newTotal) / totalQty : 0;

  const { error } = await supabase
    .from("stock")
    .update({ average_cost_per_unit: Math.round(avgCost * 100) / 100 })
    .eq("product_id", productId)
    .eq("dealer_id", dealerId);

  if (error) throw new Error(`Average cost update failed: ${error.message}`);
}

export const stockService = {
  addStock: (productId: string, quantity: number, dealerId: string) => {
    if (USE_VPS) return vpsAdjustment("add", { dealer_id: dealerId, product_id: productId, quantity });
    return applyStockChange(productId, dealerId, quantity, "add");
  },

  deductStock: (productId: string, quantity: number, dealerId: string) => {
    if (USE_VPS) return vpsAdjustment("deduct", { dealer_id: dealerId, product_id: productId, quantity });
    return applyStockChange(productId, dealerId, quantity, "deduct");
  },

  restoreStock: (productId: string, quantity: number, dealerId: string) => {
    if (USE_VPS) return vpsAdjustment("restore", { dealer_id: dealerId, product_id: productId, quantity });
    return applyStockChange(productId, dealerId, quantity, "restore");
  },

  adjustStock: (
    productId: string,
    quantity: number,
    type: "add" | "deduct",
    dealerId: string
  ) => {
    validateInput(stockAdjustmentServiceSchema, {
      product_id: productId,
      dealer_id: dealerId,
      quantity,
      type,
    });
    if (USE_VPS) return vpsAdjustment(type, { dealer_id: dealerId, product_id: productId, quantity });
    return applyStockChange(productId, dealerId, quantity, type);
  },

  getAvailableQty,
  deductStockWithBackorder,

  /**
   * Reserve stock: reduce available, increase reserved (for challan workflow)
   */
  async reserveStock(productId: string, quantity: number, dealerId: string) {
    if (quantity <= 0) throw new Error("Quantity must be positive");

    const product = await getProduct(productId);
    const stock = await getOrCreateStock(productId, dealerId);

    if (product.unit_type === "box_sft") {
      const available = Number(stock.box_qty) - Number((stock as any).reserved_box_qty ?? 0);
      if (quantity > available) throw new Error(`Insufficient available box stock (available: ${available})`);
      const { error } = await supabase
        .from("stock")
        .update({
          box_qty: Number(stock.box_qty) - quantity,
          sft_qty: (Number(stock.box_qty) - quantity) * (product.per_box_sft ?? 0),
          reserved_box_qty: Number((stock as any).reserved_box_qty ?? 0) + quantity,
        } as any)
        .eq("product_id", productId)
        .eq("dealer_id", dealerId);
      if (error) throw new Error(`Reserve stock failed: ${error.message}`);
    } else {
      const available = Number(stock.piece_qty) - Number((stock as any).reserved_piece_qty ?? 0);
      if (quantity > available) throw new Error(`Insufficient available piece stock (available: ${available})`);
      const { error } = await supabase
        .from("stock")
        .update({
          piece_qty: Number(stock.piece_qty) - quantity,
          reserved_piece_qty: Number((stock as any).reserved_piece_qty ?? 0) + quantity,
        } as any)
        .eq("product_id", productId)
        .eq("dealer_id", dealerId);
      if (error) throw new Error(`Reserve stock failed: ${error.message}`);
    }

    await logAudit({
      dealer_id: dealerId,
      action: "stock_reserve",
      table_name: "stock",
      record_id: stock.id,
      new_data: { product_id: productId, quantity, type: "reserve" },
    });
  },

  /**
   * Unreserve stock: move from reserved back to available (challan cancelled)
   */
  async unreserveStock(productId: string, quantity: number, dealerId: string) {
    if (quantity <= 0) throw new Error("Quantity must be positive");

    const product = await getProduct(productId);
    const stock = await getOrCreateStock(productId, dealerId);

    if (product.unit_type === "box_sft") {
      const { error } = await supabase
        .from("stock")
        .update({
          box_qty: Number(stock.box_qty) + quantity,
          sft_qty: (Number(stock.box_qty) + quantity) * (product.per_box_sft ?? 0),
          reserved_box_qty: Math.max(0, Number((stock as any).reserved_box_qty ?? 0) - quantity),
        } as any)
        .eq("product_id", productId)
        .eq("dealer_id", dealerId);
      if (error) throw new Error(`Unreserve stock failed: ${error.message}`);
    } else {
      const { error } = await supabase
        .from("stock")
        .update({
          piece_qty: Number(stock.piece_qty) + quantity,
          reserved_piece_qty: Math.max(0, Number((stock as any).reserved_piece_qty ?? 0) - quantity),
        } as any)
        .eq("product_id", productId)
        .eq("dealer_id", dealerId);
      if (error) throw new Error(`Unreserve stock failed: ${error.message}`);
    }

    await logAudit({
      dealer_id: dealerId,
      action: "stock_unreserve",
      table_name: "stock",
      record_id: stock.id,
      new_data: { product_id: productId, quantity, type: "unreserve" },
    });
  },

  /**
   * Deduct reserved stock permanently (challan → invoice conversion)
   */
  async deductReservedStock(productId: string, quantity: number, dealerId: string) {
    if (quantity <= 0) throw new Error("Quantity must be positive");

    const product = await getProduct(productId);
    const stock = await getOrCreateStock(productId, dealerId);

    if (product.unit_type === "box_sft") {
      const { error } = await supabase
        .from("stock")
        .update({
          reserved_box_qty: Math.max(0, Number((stock as any).reserved_box_qty ?? 0) - quantity),
        } as any)
        .eq("product_id", productId)
        .eq("dealer_id", dealerId);
      if (error) throw new Error(`Deduct reserved stock failed: ${error.message}`);
    } else {
      const { error } = await supabase
        .from("stock")
        .update({
          reserved_piece_qty: Math.max(0, Number((stock as any).reserved_piece_qty ?? 0) - quantity),
        } as any)
        .eq("product_id", productId)
        .eq("dealer_id", dealerId);
      if (error) throw new Error(`Deduct reserved stock failed: ${error.message}`);
    }

    await logAudit({
      dealer_id: dealerId,
      action: "stock_deduct_reserved",
      table_name: "stock",
      record_id: stock.id,
      new_data: { product_id: productId, quantity, type: "deduct_reserved" },
    });
  },

  updateAverageCost,

  /**
   * Deduct broken/damaged stock and log with "broken" type
   */
  async deductBrokenStock(productId: string, quantity: number, dealerId: string, reason: string) {
    if (quantity <= 0) throw new Error("Quantity must be positive");

    const product = await getProduct(productId);
    const stock = await getOrCreateStock(productId, dealerId);
    const updates = computeStockUpdate(product, stock, quantity, "deduct");

    const { error } = await supabase
      .from("stock")
      .update(updates)
      .eq("product_id", productId)
      .eq("dealer_id", dealerId);

    if (error) throw new Error(`Broken stock deduction failed: ${error.message}`);

    await logAudit({
      dealer_id: dealerId,
      action: "stock_broken",
      table_name: "stock",
      record_id: stock.id,
      old_data: { box_qty: stock.box_qty, sft_qty: stock.sft_qty, piece_qty: stock.piece_qty },
      new_data: { ...updates, adjustment_type: "broken", quantity, reason },
    });
  },
};
