import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";

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
  type: AdjustmentType
) {
  const sign = type === "deduct" ? -1 : 1;

  if (product.unit_type === "box_sft") {
    const perBoxSft = product.per_box_sft ?? 0;
    const newBoxQty = Number(currentStock.box_qty) + sign * quantity;
    if (newBoxQty < 0) throw new Error("Insufficient box stock");
    return {
      box_qty: newBoxQty,
      sft_qty: newBoxQty * perBoxSft,
    };
  }

  // piece
  const newPieceQty = Number(currentStock.piece_qty) + sign * quantity;
  if (newPieceQty < 0) throw new Error("Insufficient piece stock");
  return { piece_qty: newPieceQty };
}

async function applyStockChange(
  productId: string,
  dealerId: string,
  quantity: number,
  type: AdjustmentType
) {
  if (quantity <= 0) throw new Error("Quantity must be positive");

  const product = await getProduct(productId);
  const stock = await getOrCreateStock(productId, dealerId);
  const updates = computeStockUpdate(product, stock, quantity, type);

  const { error } = await supabase
    .from("stock")
    .update(updates)
    .eq("product_id", productId)
    .eq("dealer_id", dealerId);

  if (error) throw new Error(`Stock update failed: ${error.message}`);

  // Audit log for manual stock adjustments
  if (type === "add" || type === "deduct") {
    await logAudit({
      dealer_id: dealerId,
      action: "stock_adjustment",
      table_name: "stock",
      record_id: stock.id,
      old_data: { box_qty: stock.box_qty, sft_qty: stock.sft_qty, piece_qty: stock.piece_qty },
      new_data: { ...updates, adjustment_type: type, quantity },
    });
  }
}

async function updateAverageCost(
  productId: string,
  dealerId: string,
  newQty: number,
  newCostPerUnit: number
) {
  const stock = await getOrCreateStock(productId, dealerId);
  const currentQty =
    Number(stock.box_qty) + Number(stock.piece_qty);
  const currentTotal =
    currentQty * Number(stock.average_cost_per_unit);
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
  addStock: (productId: string, quantity: number, dealerId: string) =>
    applyStockChange(productId, dealerId, quantity, "add"),

  deductStock: (productId: string, quantity: number, dealerId: string) =>
    applyStockChange(productId, dealerId, quantity, "deduct"),

  restoreStock: (productId: string, quantity: number, dealerId: string) =>
    applyStockChange(productId, dealerId, quantity, "restore"),

  adjustStock: (
    productId: string,
    quantity: number,
    type: AdjustmentType,
    dealerId: string
  ) => applyStockChange(productId, dealerId, quantity, type),

  updateAverageCost,
};
