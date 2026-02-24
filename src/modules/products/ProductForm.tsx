import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productSchema, type ProductFormValues } from "@/modules/products/productSchema";
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
import { Shuffle } from "lucide-react";

interface ProductFormProps {
  defaultValues?: Partial<ProductFormValues>;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  isLoading?: boolean;
}

const generateSKU = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
};

const ProductForm = ({ defaultValues, onSubmit, isLoading }: ProductFormProps) => {
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
      default_sale_rate: 0,
      reorder_level: 0,
      active: true,
      ...defaultValues,
    },
  });

  const category = form.watch("category");
  const unitType = form.watch("unit_type");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        <FormControl><Input placeholder="e.g. TIL-001" {...field} /></FormControl>
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
                      <FormLabel>Brand</FormLabel>
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
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Unit: <span className="font-medium text-foreground">Piece</span> (auto-set for sanitary items)
                </div>
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
