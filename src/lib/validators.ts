import { z } from "zod";

/** Shared service-level validation schemas (server-side guard before DB writes) */

export const dealerIdSchema = z.string().uuid("Invalid dealer ID");
export const uuidSchema = z.string().uuid("Invalid ID");

export const createPurchaseServiceSchema = z.object({
  dealer_id: dealerIdSchema,
  supplier_id: uuidSchema,
  invoice_number: z.string().trim().max(50).optional().or(z.literal("")),
  purchase_date: z.string().min(1, "Date is required"),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  created_by: z.string().uuid().optional(),
  items: z.array(z.object({
    product_id: uuidSchema,
    quantity: z.number().positive("Quantity must be > 0"),
    purchase_rate: z.number().min(0),
    offer_price: z.number().min(0),
    transport_cost: z.number().min(0),
    labor_cost: z.number().min(0),
    other_cost: z.number().min(0),
  })).min(1, "At least one item required"),
});

export const createSaleServiceSchema = z.object({
  dealer_id: dealerIdSchema,
  customer_id: uuidSchema,
  sale_date: z.string().min(1, "Date is required"),
  discount: z.number().min(0).default(0),
  discount_reference: z.string().trim().max(100).optional().or(z.literal("")),
  client_reference: z.string().trim().max(100).optional().or(z.literal("")),
  fitter_reference: z.string().trim().max(100).optional().or(z.literal("")),
  paid_amount: z.number().min(0).default(0),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  created_by: z.string().uuid().optional(),
  items: z.array(z.object({
    product_id: uuidSchema,
    quantity: z.number().positive("Quantity must be > 0"),
    sale_rate: z.number().min(0),
  })).min(1, "At least one item required"),
});

export const createSalesReturnServiceSchema = z.object({
  dealer_id: dealerIdSchema,
  sale_id: uuidSchema,
  product_id: uuidSchema,
  qty: z.number().positive("Quantity must be > 0"),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
  is_broken: z.boolean(),
  refund_amount: z.number().min(0),
  return_date: z.string().min(1),
  created_by: z.string().uuid().optional(),
});

export const createExpenseServiceSchema = z.object({
  dealer_id: dealerIdSchema,
  description: z.string().trim().min(1).max(500),
  amount: z.number().positive("Amount must be > 0"),
  expense_date: z.string().min(1),
  category: z.string().trim().max(50).optional(),
  created_by: z.string().uuid().optional(),
});

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).join(", ");
    throw new Error(`Validation failed: ${msg}`);
  }
  return result.data;
}
