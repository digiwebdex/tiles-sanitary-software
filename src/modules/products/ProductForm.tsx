import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productSchema, type ProductFormValues } from "@/modules/products/productSchema";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Shuffle, Upload, X, ImagePlus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { productService } from "@/services/productService";
import { uploadProductImage, resolveImageUrl } from "@/lib/uploads";
import { toast } from "sonner";

interface ProductFormProps {
  defaultValues?: Partial<ProductFormValues>;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  isLoading?: boolean;
  productId?: string;
  dealerId?: string;
}

const generateSKU = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
};

const ProductForm = ({ defaultValues, onSubmit, isLoading, productId, dealerId }: ProductFormProps) => {
  const [skuError, setSkuError] = useState<string | null>(null);

  // Fetch last purchase cost for this product (only in edit mode)
  const { data: lastPurchaseCost } = useQuery({
    queryKey: ["product-last-cost", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_items")
        .select("landed_cost, purchase_rate, purchases!inner(purchase_date)")
        .eq("product_id", productId!)
        .eq("dealer_id", dealerId!)
        .order("purchases(purchase_date)", { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        return {
          landed_cost: Number(data[0].landed_cost) || 0,
          purchase_rate: Number(data[0].purchase_rate) || 0,
        };
      }
      return null;
    },
    enabled: !!productId && !!dealerId,
  });

  /** Check SKU uniqueness per dealer */
  const checkSkuUnique = async (sku: string): Promise<boolean> => {
    if (!dealerId || !sku.trim()) return true;
    return productService.isSkuUnique(sku, dealerId, productId);
  };

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: "",
      name: "",
      brand: "",
      category: "tiles",
      size: "",
      color: "",
      unit_type: "box_sft",
      per_box_sft: null,
      cost_price: 0,
      default_sale_rate: 0,
      reorder_level: 0,
      active: true,
      material: "",
      weight: "",
      warranty: "",
      image_url: "",
      ...defaultValues,
    },
  });

  const imageUrl = form.watch("image_url");
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setUploadingImage(true);
    try {
      const result = await uploadProductImage(file);
      form.setValue("image_url", result.url, { shouldDirty: true });
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error(err?.message || "Image upload failed");
    } finally {
      setUploadingImage(false);
    }
  };

  const category = form.watch("category");
  const unitType = form.watch("unit_type");

  const handleSubmitWithValidation = async (values: ProductFormValues) => {
    setSkuError(null);
    const isUnique = await checkSkuUnique(values.sku);
    if (!isUnique) {
      setSkuError("This product code already exists. Please use a unique code.");
      form.setError("sku", { message: "This product code already exists" });
      return;
    }
    await onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmitWithValidation)} className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Please fill in the information below. Fields marked with <span className="text-destructive">*</span> are required.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column — Product Info */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input placeholder="e.g. Floor Tiles 12x12" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Code (SKU) <span className="text-destructive">*</span></FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            placeholder="e.g. TIL-001"
                            {...field}
                            onBlur={async (e) => {
                              field.onBlur();
                              setSkuError(null);
                              const val = e.target.value.trim();
                              if (val && dealerId) {
                                const isUnique = await checkSkuUnique(val);
                                if (!isUnique) {
                                  const msg = "This product code already exists";
                                  setSkuError(msg);
                                  form.setError("sku", { message: msg });
                                }
                              }
                            }}
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="Generate random code"
                          onClick={() => form.setValue("sku", generateSKU())}
                        >
                          <Shuffle className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormDescription>
                        You can scan your barcode or enter a unique product code
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input placeholder="e.g. DBL Ceramics" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={(val) => {
                        field.onChange(val);
                        if (val === "sanitary") {
                          form.setValue("unit_type", "piece");
                          form.setValue("per_box_sft", null);
                        } else {
                          form.setValue("unit_type", "box_sft");
                        }
                      }} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="tiles">Tiles</SelectItem>
                          <SelectItem value="sanitary">Sanitary</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">
                  Unit & Dimensions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
              {category === "tiles" && (
                <>
                  <FormField
                    control={form.control}
                    name="unit_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Unit <span className="text-destructive">*</span></FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select Unit" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="box_sft">Box / SFT</SelectItem>
                            <SelectItem value="piece">Piece</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {unitType === "box_sft" && (
                    <FormField
                      control={form.control}
                      name="per_box_sft"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Per Box SFT <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="e.g. 12.5"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormDescription>Square feet per box for SFT calculation</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </>
              )}

              {category === "sanitary" && (
                <>
                  <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    Unit: <span className="font-medium text-foreground">Piece</span> (auto-set for sanitary items)
                  </div>

                  <Separator />

                  <FormField
                    control={form.control}
                    name="material"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Material</FormLabel>
                        <FormControl><Input placeholder="e.g. Ceramic, Porcelain, Stainless Steel" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="weight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Weight</FormLabel>
                          <FormControl><Input placeholder="e.g. 5 kg" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="warranty"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Warranty</FormLabel>
                          <FormControl><Input placeholder="e.g. 1 Year, 5 Years" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="size"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Size</FormLabel>
                        <FormControl><Input placeholder={category === "sanitary" ? 'e.g. 20 inch' : 'e.g. 12x12'} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Color</FormLabel>
                        <FormControl><Input placeholder="e.g. White" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column — Pricing & Settings */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">
                  Pricing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="cost_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Cost Price</FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
                      <FormDescription>Purchase/cost price per unit</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="default_sale_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Price (Sale Rate) <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
                      <FormDescription>Default selling price per unit</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {lastPurchaseCost && (() => {
                  const isBoxSft = unitType === "box_sft";
                  const perBoxSft = Number(form.getValues("per_box_sft")) || 0;
                  const landedPerBox = isBoxSft && perBoxSft > 0 ? lastPurchaseCost.landed_cost * perBoxSft : 0;

                  return (
                    <div className="rounded-md border bg-muted/50 p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase">Last Purchase Cost</p>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div>
                          <span className="text-xs text-muted-foreground">Rate: </span>
                          <span className="text-sm font-semibold text-foreground">{formatCurrency(Math.max(0, lastPurchaseCost.purchase_rate))}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Landed{isBoxSft ? "/Sft" : ""}: </span>
                          <span className="text-sm font-semibold text-primary">{formatCurrency(Math.max(0, lastPurchaseCost.landed_cost))}</span>
                        </div>
                        {isBoxSft && perBoxSft > 0 && (
                          <div>
                            <span className="text-xs text-muted-foreground">Landed/Box: </span>
                            <span className="text-sm font-semibold text-primary">{formatCurrency(Math.max(0, landedPerBox))}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">
                  Inventory Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="reorder_level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alert Quantity (Reorder Level)</FormLabel>
                      <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                      <FormDescription>You'll get a low-stock alert when quantity falls below this</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel className="!mt-0">Active</FormLabel>
                        <FormDescription>Inactive products won't appear in sales</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <Button type="submit" disabled={isLoading} className="w-full md:w-auto">
          {isLoading ? "Saving…" : defaultValues ? "Update Product" : "Add Product"}
        </Button>
      </form>
    </Form>
  );
};

export default ProductForm;
