import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { salesReturnSchema, type SalesReturnFormValues } from "@/modules/sales-returns/salesReturnSchema";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { salesReturnService } from "@/services/salesReturnService";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface SalesReturnFormProps {
  dealerId: string;
  onSubmit: (values: SalesReturnFormValues) => Promise<void>;
  isLoading?: boolean;
}

const SalesReturnForm = ({ dealerId, onSubmit, isLoading }: SalesReturnFormProps) => {
  const [selectedSaleId, setSelectedSaleId] = useState<string>("");

  const form = useForm<SalesReturnFormValues>({
    resolver: zodResolver(salesReturnSchema),
    defaultValues: {
      sale_id: "",
      product_id: "",
      qty: 0,
      reason: "",
      is_broken: false,
      refund_amount: 0,
      return_date: new Date().toISOString().split("T")[0],
    },
  });

  // Fetch sales for this dealer
  const { data: sales = [] } = useQuery({
    queryKey: ["sales-for-return", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, invoice_number, sale_date, customers(name)")
        .eq("dealer_id", dealerId)
        .order("sale_date", { ascending: false });
      return data ?? [];
    },
    enabled: !!dealerId,
  });

  // Fetch sale items when a sale is selected
  const { data: saleItems = [] } = useQuery({
    queryKey: ["sale-items-return", selectedSaleId],
    queryFn: () => salesReturnService.getSaleItems(selectedSaleId),
    enabled: !!selectedSaleId,
  });

  const handleSaleChange = (saleId: string) => {
    setSelectedSaleId(saleId);
    form.setValue("sale_id", saleId);
    form.setValue("product_id", "");
    form.setValue("qty", 0);
    form.setValue("refund_amount", 0);
  };

  const handleProductChange = (productId: string) => {
    form.setValue("product_id", productId);
    const item = saleItems.find((i: any) => i.product_id === productId);
    if (item) {
      form.setValue("refund_amount", Number(item.sale_rate) * (form.getValues("qty") || 0));
    }
  };

  const watchQty = form.watch("qty");
  const watchProductId = form.watch("product_id");

  const selectedItem = saleItems.find((i: any) => i.product_id === watchProductId);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="sale_id"
            render={() => (
              <FormItem>
                <FormLabel>Sale / Invoice</FormLabel>
                <Select onValueChange={handleSaleChange} value={selectedSaleId}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select sale" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {sales.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.invoice_number} — {(s.customers as any)?.name ?? "Unknown"} ({s.sale_date})
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
            name="product_id"
            render={() => (
              <FormItem>
                <FormLabel>Product</FormLabel>
                <Select onValueChange={handleProductChange} value={watchProductId} disabled={!selectedSaleId}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {saleItems.map((item: any) => (
                      <SelectItem key={item.product_id} value={item.product_id}>
                        {item.products?.sku} — {item.products?.name}
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Sold: {item.quantity}
                        </Badge>
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
            name="qty"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Return Quantity</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    max={selectedItem ? Number(selectedItem.quantity) : undefined}
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      if (selectedItem) {
                        const qty = parseFloat(e.target.value) || 0;
                        form.setValue("refund_amount", qty * Number(selectedItem.sale_rate));
                      }
                    }}
                  />
                </FormControl>
                {selectedItem && (
                  <p className="text-xs text-muted-foreground">
                    Max: {Number(selectedItem.quantity)} ({selectedItem.products?.unit_type === "box_sft" ? "boxes" : "pieces"})
                  </p>
                )}
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
            name="refund_amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Refund Amount (৳)</FormLabel>
                <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="is_broken"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3 pt-6">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="!mt-0">Broken / Damaged (no restock)</FormLabel>
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reason</FormLabel>
              <FormControl><Textarea placeholder="Reason for return" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {watchQty > 0 && selectedItem && (
          <Card>
            <CardContent className="flex items-center gap-6 pt-4 text-sm">
              <span className="text-muted-foreground">
                Return: <strong className="text-foreground">{watchQty} {selectedItem.products?.unit_type === "box_sft" ? "boxes" : "pcs"}</strong>
              </span>
              <span className="text-muted-foreground">
                Refund: <strong className="text-foreground">{formatCurrency(form.watch("refund_amount") || 0)}</strong>
              </span>
              {form.watch("is_broken") && (
                <Badge variant="destructive">No restock</Badge>
              )}
            </CardContent>
          </Card>
        )}

        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Processing…" : "Confirm Return"}
        </Button>
      </form>
    </Form>
  );
};

export default SalesReturnForm;
