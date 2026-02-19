import { useState, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { saleSchema, type SaleFormValues } from "@/modules/sales/saleSchema";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface SaleFormProps {
  dealerId: string;
  onSubmit: (values: SaleFormValues) => Promise<void>;
  isLoading?: boolean;
}

const SaleForm = ({ dealerId, onSubmit, isLoading }: SaleFormProps) => {
  const [skuSearch, setSkuSearch] = useState("");

  const form = useForm<SaleFormValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      customer_id: "",
      sale_date: new Date().toISOString().split("T")[0],
      discount: 0,
      discount_reference: "",
      client_reference: "",
      fitter_reference: "",
      paid_amount: 0,
      notes: "",
      items: [{ product_id: "", quantity: 0, sale_rate: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, type")
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
        .select("id, name, sku, unit_type, per_box_sft, default_sale_rate")
        .eq("dealer_id", dealerId)
        .eq("active", true);
      return data ?? [];
    },
    enabled: !!dealerId,
  });

  const filteredProducts = useMemo(() => {
    if (!skuSearch.trim()) return products;
    const q = skuSearch.toLowerCase();
    return products.filter(
      (p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    );
  }, [products, skuSearch]);

  const watchItems = form.watch("items");
  const watchDiscount = form.watch("discount") || 0;
  const watchPaid = form.watch("paid_amount") || 0;

  const getProduct = (pid: string) => products.find((p) => p.id === pid);

  const calcItemSft = (idx: number) => {
    const item = watchItems[idx];
    if (!item) return null;
    const product = getProduct(item.product_id);
    if (product?.unit_type === "box_sft" && product.per_box_sft) {
      return (item.quantity || 0) * product.per_box_sft;
    }
    return null;
  };

  const subtotal = watchItems.reduce(
    (s, item) => s + (item.quantity || 0) * (item.sale_rate || 0),
    0
  );
  const totalAmount = subtotal - watchDiscount;
  const dueAmount = totalAmount - watchPaid;

  // Summary totals
  const summaryTotals = watchItems.reduce(
    (acc, item) => {
      const product = getProduct(item.product_id);
      if (product?.unit_type === "box_sft") {
        acc.box += item.quantity || 0;
        acc.sft += (item.quantity || 0) * (product.per_box_sft ?? 0);
      } else if (product) {
        acc.piece += item.quantity || 0;
      }
      return acc;
    },
    { box: 0, sft: 0, piece: 0 }
  );

  const handleProductSelect = (idx: number, productId: string) => {
    form.setValue(`items.${idx}.product_id`, productId);
    const product = getProduct(productId);
    if (product) {
      form.setValue(`items.${idx}.sale_rate`, product.default_sale_rate);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Header */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="customer_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Customer</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          {c.name}
                          <Badge variant="outline" className="text-xs capitalize">{c.type}</Badge>
                        </span>
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
            name="sale_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sale Date</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="client_reference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client Reference</FormLabel>
                <FormControl><Input placeholder="Client ref" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fitter_reference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fitter Reference</FormLabel>
                <FormControl><Input placeholder="Fitter ID" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="discount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Discount (৳)</FormLabel>
                <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="discount_reference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Discount Reference</FormLabel>
                <FormControl><Input placeholder="Reason / approval" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Items</h3>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search SKU…"
                  value={skuSearch}
                  onChange={(e) => setSkuSearch(e.target.value)}
                  className="w-48 pl-8"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ product_id: "", quantity: 0, sale_rate: 0 })}
              >
                <Plus className="mr-1 h-4 w-4" /> Add Item
              </Button>
            </div>
          </div>

          {fields.map((field, idx) => {
            const selectedProduct = getProduct(watchItems[idx]?.product_id);
            const itemSft = calcItemSft(idx);
            const itemTotal = (watchItems[idx]?.quantity || 0) * (watchItems[idx]?.sale_rate || 0);

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
                    render={() => (
                      <FormItem className="col-span-2">
                        <FormLabel>Product</FormLabel>
                        <Select
                          onValueChange={(v) => handleProductSelect(idx, v)}
                          value={watchItems[idx]?.product_id}
                        >
                          <FormControl><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {filteredProducts.map((p) => (
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
                    name={`items.${idx}.sale_rate`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Sale Rate</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...f} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="col-span-2 flex gap-4 rounded-md bg-muted p-3 text-sm md:col-span-4">
                    {itemSft !== null && (
                      <span className="text-muted-foreground">
                        SFT: <strong className="text-foreground">{itemSft.toFixed(2)}</strong>
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      Total: <strong className="text-foreground">{formatCurrency(itemTotal)}</strong>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Payment */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="paid_amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Paid Amount (৳)</FormLabel>
                <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/50 p-4 text-sm md:grid-cols-6">
          <div>
            <span className="text-muted-foreground">Boxes</span>
            <p className="font-semibold">{summaryTotals.box}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total SFT</span>
            <p className="font-semibold">{summaryTotals.sft.toFixed(2)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Pieces</span>
            <p className="font-semibold">{summaryTotals.piece}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Subtotal</span>
            <p className="font-semibold">{formatCurrency(subtotal)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">After Discount</span>
            <p className="font-semibold">{formatCurrency(totalAmount)}</p>
          </div>
          <div>
            <span className={dueAmount > 0 ? "text-destructive" : "text-muted-foreground"}>
              Due
            </span>
            <p className="font-semibold">{formatCurrency(dueAmount)}</p>
          </div>
        </div>

        <Button type="submit" disabled={isLoading} className="w-full md:w-auto">
          {isLoading ? "Processing…" : "Confirm Sale"}
        </Button>
      </form>
    </Form>
  );
};

export default SaleForm;
