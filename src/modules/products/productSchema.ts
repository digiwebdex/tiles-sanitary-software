import { z } from "zod";

export const productSchema = z
  .object({
    sku: z.string().trim().min(1, "SKU is required").max(50, "SKU too long"),
    name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
    brand: z.string().trim().max(50).optional().or(z.literal("")),
    category: z.enum(["tiles", "sanitary"], { required_error: "Category is required" }),
    size: z.string().trim().max(30).optional().or(z.literal("")),
    color: z.string().trim().max(30).optional().or(z.literal("")),
    unit_type: z.enum(["box_sft", "piece"], { required_error: "Unit type is required" }),
    per_box_sft: z.coerce.number().min(0).optional().nullable(),
    default_sale_rate: z.coerce.number().min(0, "Rate must be ≥ 0"),
    reorder_level: z.coerce.number().int().min(0, "Reorder level must be ≥ 0"),
    active: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.unit_type === "box_sft" && (!data.per_box_sft || data.per_box_sft <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Per box SFT is required when unit type is Box/SFT",
        path: ["per_box_sft"],
      });
    }
  });

export type ProductFormValues = z.infer<typeof productSchema>;
