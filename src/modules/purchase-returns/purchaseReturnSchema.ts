import { z } from "zod";

export const purchaseReturnItemSchema = z.object({
  product_id: z.string().min(1, "Product is required"),
  quantity: z.coerce.number().min(0.01, "Quantity must be > 0"),
  unit_price: z.coerce.number().min(0, "Price must be ≥ 0"),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});

export const purchaseReturnSchema = z.object({
  supplier_id: z.string().min(1, "Supplier is required"),
  purchase_id: z.string().optional().or(z.literal("")),
  return_date: z.string().min(1, "Date is required"),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  items: z.array(purchaseReturnItemSchema).min(1, "At least one item is required"),
});

export type PurchaseReturnFormValues = z.infer<typeof purchaseReturnSchema>;
