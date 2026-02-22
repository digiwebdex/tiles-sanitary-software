import { z } from "zod";

export const saleItemSchema = z.object({
  product_id: z.string().min(1, "Product is required"),
  quantity: z.coerce.number().min(0.01, "Quantity must be > 0"),
  sale_rate: z.coerce.number().min(0, "Rate must be ≥ 0"),
});

export const saleSchema = z.object({
  customer_name: z.string().trim().min(1, "Customer name is required").max(200),
  sale_date: z.string().min(1, "Date is required"),
  discount: z.coerce.number().min(0).default(0),
  discount_reference: z.string().trim().max(100).optional().or(z.literal("")),
  client_reference: z.string().trim().max(100).optional().or(z.literal("")),
  fitter_reference: z.string().trim().max(100).optional().or(z.literal("")),
  paid_amount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  items: z.array(saleItemSchema).min(1, "At least one item is required"),
});

export type SaleFormValues = z.infer<typeof saleSchema>;
