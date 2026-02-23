import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { purchaseReturnSchema, type PurchaseReturnFormValues } from "./purchaseReturnSchema";
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
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface PurchaseReturnFormProps {
  dealerId: string;
  onSubmit: (values: PurchaseReturnFormValues) => Promise<void>;
  isLoading?: boolean;
}

const PurchaseReturnForm = ({ dealerId, onSubmit, isLoading }: PurchaseReturnFormProps) => {
  const form = useForm<PurchaseReturnFormValues>({
    resolver: zodResolver(purchaseReturnSchema),
    defaultValues: {
      supplier_id: "",
      purchase_id: "",
      return_date: new Date().toISOString().split("T")[0],
      notes: "",
      items: [{ product_id: "", quantity: 0, unit_price: 0, reason: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-for-return", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("dealer_id", dealerId)
        .eq("status", "active")
        .order("name");
      return data ?? [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-for-return", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("dealer_id", dealerId)
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const watchItems = form.watch("items");
  const grandTotal = watchItems.reduce((s, item) => s + (item.quantity || 0) * (item.unit_price || 0), 0);

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
            name="return_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Return Date</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
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
                <FormControl><Textarea placeholder="Optional notes" rows={1} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase">Return Items</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ product_id: "", quantity: 0, unit_price: 0, reason: "" })}
            >
              <Plus className="mr-1 h-3 w-3" /> Add Item
            </Button>
          </div>

          {fields.map((field, index) => (
            <Card key={field.id}>
              <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-4">
                <FormField
                  control={form.control}
                  name={`items.${index}.product_id`}
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Product</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`items.${index}.quantity`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Qty</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`items.${index}.unit_price`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Price (৳)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Total</p>
                    <p className="text-sm font-semibold">
                      {formatCurrency((watchItems[index]?.quantity || 0) * (watchItems[index]?.unit_price || 0))}
                    </p>
                  </div>
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="flex items-center justify-between pt-4">
            <span className="text-sm text-muted-foreground">Grand Total</span>
            <span className="text-lg font-bold">{formatCurrency(grandTotal)}</span>
          </CardContent>
        </Card>

        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Processing…" : "Confirm Purchase Return"}
        </Button>
      </form>
    </Form>
  );
};

export default PurchaseReturnForm;
