import { z } from "zod";

export const quotationItemSchema = z.object({
  id: z.string().optional(),
  product_id: z.string().nullable().optional(),
  product_name_snapshot: z.string().min(1, "Product name required"),
  product_sku_snapshot: z.string().nullable().optional(),
  unit_type: z.enum(["box_sft", "piece"]).default("piece"),
  per_box_sft: z.coerce.number().nullable().optional(),
  quantity: z.coerce.number().min(0.01, "Qty > 0 required"),
  rate: z.coerce.number().min(0),
  discount_value: z.coerce.number().min(0).default(0),
  line_total: z.coerce.number().min(0).default(0),
  preferred_shade_code: z.string().nullable().optional(),
  preferred_caliber: z.string().nullable().optional(),
  preferred_batch_no: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sort_order: z.coerce.number().int().default(0),
});

export const quotationFormSchema = z
  .object({
    customer_id: z.string().nullable().optional(),
    customer_name_text: z.string().optional().default(""),
    customer_phone_text: z.string().optional().default(""),
    customer_address_text: z.string().optional().default(""),
    quote_date: z.string().min(1),
    valid_until: z.string().min(1),
    discount_type: z.enum(["flat", "percent"]).default("flat"),
    discount_value: z.coerce.number().min(0).default(0),
    notes: z.string().optional().default(""),
    terms_text: z.string().optional().default(""),
    items: z.array(quotationItemSchema).min(1, "Add at least one item"),
  })
  .refine(
    (v) => !!v.customer_id || (v.customer_name_text?.trim().length ?? 0) > 0,
    { message: "Pick a customer or enter a walk-in name", path: ["customer_id"] },
  );

export type QuotationItemInput = z.infer<typeof quotationItemSchema>;
export type QuotationFormInput = z.infer<typeof quotationFormSchema>;
