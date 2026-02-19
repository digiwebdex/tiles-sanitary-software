import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { purchaseSchema, type PurchaseFormValues } from "@/modules/purchases/purchaseSchema";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface PurchaseFormProps {
  dealerId: string;
  showOfferPrice: boolean;
  onSubmit: (values: PurchaseFormValues) => Promise<void>;
  isLoading?: boolean;
}

const PurchaseForm = ({ dealerId, showOfferPrice, onSubmit, isLoading }: PurchaseFormProps) => {
  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      supplier_id: "",
      invoice_number: "",
      purchase_date: new Date().toISOString().split("T")[0],
      notes: "",
      items: [
        {
          product_id: "",
          quantity: 0,
          purchase_rate: 0,
          offer_price: 0,
          transport_cost: 0,
          labor_cost: 0,
          other_cost: 0,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("dealer_id", dealerId);
      return data ?? [];
    },
    enabled: !!dealerId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-active", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, unit_type, per_box_sft")
        .eq("dealer_id", dealerId)
        .eq("active", true);
      return data ?? [];
    },
    enabled: !!dealerId,
  });

  const watchItems = form.watch("items");

  const getItemProduct = (productId: string) =>
    products.find((p) => p.id === productId);

  const calcLandedCost = (idx: number) => {
    const item = watchItems[idx];
    if (!item) return 0;
    const itemTotal = (item.quantity || 0) * (item.purchase_rate || 0);
    return itemTotal + (item.transport_cost || 0) + (item.labor_cost || 0) + (item.other_cost || 0);
  };

  const calcTotalSft = (idx: number) => {
    const item = watchItems[idx];
    if (!item) return null;
    const product = getItemProduct(item.product_id);
    if (product?.unit_type === "box_sft" && product.per_box_sft) {
      return (item.quantity || 0) * product.per_box_sft;
    }
    return null;
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="supplier_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Supplier</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="invoice_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Invoice No</FormLabel>
                <FormControl><Input placeholder="INV-001" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="purchase_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Purchase Date</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Items</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  product_id: "",
                  quantity: 0,
                  purchase_rate: 0,
                  offer_price: 0,
                  transport_cost: 0,
                  labor_cost: 0,
                  other_cost: 0,
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Add Item
            </Button>
          </div>

          {fields.map((field, idx) => {
            const selectedProduct = getItemProduct(watchItems[idx]?.product_id);
            const totalSft = calcTotalSft(idx);
            const landedCost = calcLandedCost(idx);

            return (
              <Card key={field.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">Item {idx + 1}</CardTitle>
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <FormField
                    control={form.control}
                    name={`items.${idx}.product_id`}
                    render={({ field: f }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Product</FormLabel>
                        <Select onValueChange={f.onChange} value={f.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.sku} — {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`items.${idx}.quantity`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>
                          {selectedProduct?.unit_type === "box_sft" ? "Box Qty" : "Piece Qty"}
                        </FormLabel>
                        <FormControl><Input type="number" step="0.01" {...f} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`items.${idx}.purchase_rate`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Purchase Rate</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...f} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {showOfferPrice && (
                    <FormField
                      control={form.control}
                      name={`items.${idx}.offer_price`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Offer Price</FormLabel>
                          <FormControl><Input type="number" step="0.01" {...f} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name={`items.${idx}.transport_cost`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Transport</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...f} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`items.${idx}.labor_cost`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Labor</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...f} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`items.${idx}.other_cost`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Other Cost</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...f} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="col-span-2 flex gap-4 rounded-md bg-muted p-3 text-sm md:col-span-4">
                    {totalSft !== null && (
                      <span className="text-muted-foreground">
                        Total SFT: <strong className="text-foreground">{totalSft.toFixed(2)}</strong>
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      Landed Cost: <strong className="text-foreground">{formatCurrency(landedCost)}</strong>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl><Textarea placeholder="Optional notes" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center justify-between rounded-md border bg-muted/50 p-4">
          <span className="font-semibold text-foreground">
            Grand Total: {formatCurrency(watchItems.reduce((s, _, i) => s + calcLandedCost(i), 0))}
          </span>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving…" : "Save Purchase"}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default PurchaseForm;
