import { z } from "zod";

export const productSchema = z
  .object({
    sku: z.string().trim().min(1, "Product code is required").max(50, "Product code too long"),
    name: z.string().trim().min(1, "Product name is required").max(100, "Product name too long"),
    brand: z.string().trim().min(1, "Brand is required").max(50, "Brand too long"),
    category: z.enum(["tiles", "sanitary"], { required_error: "Category is required" }),
    size: z.string().trim().max(30).optional().or(z.literal("")),
    color: z.string().trim().max(30).optional().or(z.literal("")),
    unit_type: z.enum(["box_sft", "piece"], { required_error: "Unit type is required" }),
    per_box_sft: z.coerce.number().min(0).optional().nullable(),
    cost_price: z.coerce.number().min(0, "Cost price must be ≥ 0"),
    default_sale_rate: z.coerce.number().positive("Product price must be greater than 0"),
    reorder_level: z.coerce.number().int().min(0, "Reorder level must be ≥ 0"),
    active: z.boolean().default(true),
    material: z.string().trim().max(50).optional().or(z.literal("")),
    weight: z.string().trim().max(30).optional().or(z.literal("")),
    warranty: z.string().trim().max(50).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.unit_type === "box_sft" && (!data.per_box_sft || data.per_box_sft <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Per box SFT is required when unit type is Box/SFT",
        path: ["per_box_sft"],
      });
    }
  })
  .transform((data) => ({
    ...data,
    per_box_sft: data.unit_type === "piece" ? null : data.per_box_sft,
    material: data.category === "sanitary" ? data.material : undefined,
    weight: data.category === "sanitary" ? data.weight : undefined,
    warranty: data.category === "sanitary" ? data.warranty : undefined,
  }));

export type ProductFormValues = z.infer<typeof productSchema>;
