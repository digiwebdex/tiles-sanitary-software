import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Search, Barcode, AlertTriangle } from "lucide-react";
import { formatCurrency, CURRENCY_CODE } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface SaleFormProps {
  dealerId: string;
  onSubmit: (values: SaleFormValues) => Promise<void>;
  isLoading?: boolean;
  defaultValues?: Partial<SaleFormValues>;
  submitLabel?: string;
  priceLocked?: boolean;
}

const SaleForm = ({ dealerId, onSubmit, isLoading, defaultValues: dv, submitLabel, priceLocked }: SaleFormProps) => {
  const { user, isDealerAdmin } = useAuth();
  const [itemSearches, setItemSearches] = useState<Record<number, string>>({});

  const form = useForm<SaleFormValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      customer_name: dv?.customer_name ?? "",
      sale_date: dv?.sale_date ?? new Date().toISOString().split("T")[0],
      sale_type: dv?.sale_type ?? "direct_invoice",
      discount: dv?.discount ?? 0,
      discount_reference: dv?.discount_reference ?? "",
      client_reference: dv?.client_reference ?? "",
      fitter_reference: dv?.fitter_reference ?? "",
      paid_amount: dv?.paid_amount ?? 0,
      notes: dv?.notes ?? "",
      items: dv?.items?.length ? dv.items : [{ product_id: "", quantity: 0, sale_rate: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
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

  // Fetch customers for overdue check
  const { data: allCustomers = [] } = useQuery({
    queryKey: ["customers-for-sale-overdue", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, credit_limit, max_overdue_days")
        .eq("dealer_id", dealerId)
        .eq("status", "active");
      return data ?? [];
    },
    enabled: !!dealerId,
  });

  const watchCustomerName = form.watch("customer_name");
  const matchedCustomer = allCustomers.find(
    (c) => c.name.toLowerCase() === (watchCustomerName ?? "").toLowerCase().trim()
  );

  const { data: overdueInfo } = useQuery({
    queryKey: ["sale-overdue-check", matchedCustomer?.id],
    queryFn: async () => {
      if (!matchedCustomer) return null;
      const [ledgerRes, salesRes] = await Promise.all([
        supabase.from("customer_ledger").select("amount, type").eq("customer_id", matchedCustomer.id).eq("dealer_id", dealerId),
        supabase.from("sales").select("sale_date, due_amount").eq("customer_id", matchedCustomer.id).eq("dealer_id", dealerId).gt("due_amount", 0).order("sale_date", { ascending: true }).limit(1),
      ]);
      let outstanding = 0;
      for (const row of ledgerRes.data ?? []) {
        const amt = Number(row.amount);
        if (row.type === "sale") outstanding += amt;
        else if (row.type === "payment" || row.type === "refund") outstanding -= amt;
        else if (row.type === "adjustment") outstanding += amt;
      }
      const oldestDate = salesRes.data?.[0]?.sale_date ?? null;
      const daysOverdue = oldestDate ? Math.max(0, Math.floor((Date.now() - new Date(oldestDate).getTime()) / 86400000)) : 0;
      return {
        outstanding: Math.round(outstanding * 100) / 100,
        daysOverdue,
        maxOverdueDays: Number(matchedCustomer.max_overdue_days ?? 0),
        creditLimit: Number(matchedCustomer.credit_limit ?? 0),
        isOverdueViolated: Number(matchedCustomer.max_overdue_days ?? 0) > 0 && daysOverdue > Number(matchedCustomer.max_overdue_days ?? 0),
        isCreditExceeded: Number(matchedCustomer.credit_limit ?? 0) > 0 && outstanding > Number(matchedCustomer.credit_limit ?? 0),
      };
    },
    enabled: !!matchedCustomer,
  });

  const { data: stockData = [] } = useQuery({
    queryKey: ["stock-for-sale", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock")
        .select("product_id, average_cost_per_unit")
        .eq("dealer_id", dealerId);
      return data ?? [];
    },
    enabled: !!dealerId && isDealerAdmin,
  });

  const stockMap = new Map(stockData.map((s) => [s.product_id, Number(s.average_cost_per_unit)]));

  const getFilteredProducts = (idx: number) => {
    const q = (itemSearches[idx] ?? "").toLowerCase().trim();
    if (!q) return products;
    return products.filter(
      (p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    );
  };

  const watchItems = form.watch("items");
  const watchDiscount = form.watch("discount") || 0;
  const watchPaid = form.watch("paid_amount") || 0;

  const getProduct = (pid: string) => products.find((p) => p.id === pid);

  const calcItemTotal = (idx: number) => {
    const item = watchItems[idx];
    if (!item) return 0;
    const product = getProduct(item.product_id);
    if (product?.unit_type === "box_sft" && product.per_box_sft) {
      return (item.quantity || 0) * product.per_box_sft * (item.sale_rate || 0);
    }
    return (item.quantity || 0) * (item.sale_rate || 0);
  };

  const calcItemSft = (idx: number) => {
    const item = watchItems[idx];
    if (!item) return null;
    const product = getProduct(item.product_id);
    if (product?.unit_type === "box_sft" && product.per_box_sft) {
      return (item.quantity || 0) * product.per_box_sft;
    }
    return null;
  };

  const subtotal = watchItems.reduce((s, _, idx) => s + calcItemTotal(idx), 0);
  const totalAmount = subtotal - watchDiscount;
  const dueAmount = Math.max(0, totalAmount - watchPaid);

  const estimatedCogs = watchItems.reduce((acc, item) => {
    if (!item.product_id || !item.quantity) return acc;
    const avgCost = stockMap.get(item.product_id) ?? 0;
    return acc + Number(item.quantity) * avgCost;
  }, 0);
  const estimatedGrossProfit = totalAmount - estimatedCogs;

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

  const handleFormSubmit = async (values: SaleFormValues) => {
    await onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-5 pb-28">
        {/* Sale Info Card */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="client_reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference No</FormLabel>
                    <FormControl><Input placeholder="Auto or manual" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sale_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sale Date *</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sale_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sale Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="direct_invoice">Direct Invoice</SelectItem>
                        <SelectItem value="challan_mode">Challan Mode</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Customer & References */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-xs text-yellow-800">
              Please select customer before adding any product
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer *</FormLabel>
                    <FormControl><Input placeholder="Type customer name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="retailer">Retailer</SelectItem>
                        <SelectItem value="customer">Customer</SelectItem>
                        <SelectItem value="project">Project</SelectItem>
                      </SelectContent>
                    </Select>
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
            </div>
          </CardContent>
        </Card>

        {/* Product Search Bar */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3">
              <Barcode className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">Please add products to order list</span>
            </div>
          </CardContent>
        </Card>

        {/* Payment Lock Warning */}
        {priceLocked && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive font-medium">
            🔒 Price editing is locked because a payment has been recorded against this sale. Only notes and non-financial fields can be changed.
          </div>
        )}

        {/* Order Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Order Items *</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ product_id: "", quantity: 0, sale_rate: 0 })}
              disabled={priceLocked}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
            </Button>
          </div>

          {/* Table header */}
          <div className="hidden md:grid md:grid-cols-12 gap-2 rounded-t-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <div className="col-span-5">Product (Code - Name)</div>
            <div className="col-span-2 text-center">Quantity</div>
            <div className="col-span-2 text-right">Unit Price</div>
            <div className="col-span-2 text-right">Subtotal ({CURRENCY_CODE})</div>
            <div className="col-span-1 text-center">⋯</div>
          </div>

          {fields.map((field, idx) => {
            const selectedProduct = getProduct(watchItems[idx]?.product_id);
            const itemSft = calcItemSft(idx);
            const itemTotal = calcItemTotal(idx);
            const filtered = getFilteredProducts(idx);
            const searchVal = itemSearches[idx] ?? "";

            return (
              <div
                key={field.id}
                className="grid grid-cols-1 gap-2 rounded-md border bg-background p-3 md:grid-cols-12 md:items-center md:gap-2 md:p-2"
              >
                {/* Product */}
                <div className="col-span-5 relative">
                  <FormField
                    control={form.control}
                    name={`items.${idx}.product_id`}
                    render={() => (
                      <FormItem className="space-y-0">
                        {selectedProduct ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 rounded border px-2 py-1.5 text-sm bg-muted/30">
                              <span className="font-mono text-xs text-muted-foreground">{selectedProduct.sku}</span>
                              {" — "}
                              <span>{selectedProduct.name}</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => {
                                form.setValue(`items.${idx}.product_id`, "");
                                form.setValue(`items.${idx}.sale_rate`, 0);
                                setItemSearches((s) => ({ ...s, [idx]: "" }));
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ) : (
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="Search SKU or name…"
                              value={searchVal}
                              onChange={(e) =>
                                setItemSearches((s) => ({ ...s, [idx]: e.target.value }))
                              }
                              className="pl-7 h-8 text-sm"
                              autoComplete="off"
                            />
                            {searchVal.length > 0 && filtered.length > 0 && (
                              <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
                                {filtered.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                                    onClick={() => {
                                      handleProductSelect(idx, p.id);
                                      setItemSearches((s) => ({ ...s, [idx]: "" }));
                                    }}
                                  >
                                    <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                                    <span className="truncate">{p.name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {searchVal.length > 0 && filtered.length === 0 && (
                              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 text-sm text-muted-foreground shadow-md">
                                No products found
                              </div>
                            )}
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Quantity */}
                <div className="col-span-2">
                  <FormField
                    control={form.control}
                    name={`items.${idx}.quantity`}
                    render={({ field: f }) => (
                      <FormItem className="space-y-0">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder={selectedProduct?.unit_type === "box_sft" ? "Box qty" : "Qty"}
                            className="h-8 text-sm text-center"
                            disabled={priceLocked}
                            {...f}
                          />
                        </FormControl>
                        {itemSft !== null && (
                          <p className="text-[10px] text-muted-foreground text-center mt-0.5">
                            {itemSft.toFixed(2)} Sft
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Unit Price */}
                <div className="col-span-2">
                  <FormField
                    control={form.control}
                    name={`items.${idx}.sale_rate`}
                    render={({ field: f }) => (
                      <FormItem className="space-y-0">
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="Rate" className="h-8 text-sm text-right" disabled={priceLocked} {...f} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Subtotal */}
                <div className="col-span-2 text-right text-sm font-semibold text-foreground py-1">
                  {formatCurrency(itemTotal)}
                </div>

                {/* Remove */}
                <div className="col-span-1 flex justify-center">
                  {fields.length > 1 && !priceLocked && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Discount, Payment & Notes */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="discount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order Discount (৳)</FormLabel>
                    <FormControl><Input type="number" step="0.01" disabled={priceLocked} {...field} /></FormControl>
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
            </div>

            <Separator />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sale Note</FormLabel>
                  <FormControl><Textarea placeholder="Optional notes…" rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Live Profit Preview — Owner only */}
        {isDealerAdmin && estimatedCogs > 0 && (
          <div className="grid grid-cols-3 gap-3 rounded-md border border-primary/20 bg-primary/5 p-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs uppercase font-semibold">Est. COGS</span>
              <p className="font-semibold text-destructive">{formatCurrency(estimatedCogs)}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase font-semibold">Est. Gross Profit</span>
              <p className={`font-semibold ${estimatedGrossProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatCurrency(estimatedGrossProfit)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase font-semibold">Est. Margin</span>
              <p className={`font-semibold ${estimatedGrossProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                {totalAmount > 0 ? `${((estimatedGrossProfit / totalAmount) * 100).toFixed(1)}%` : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Submit + Reset */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Processing…" : (submitLabel ?? (form.watch("sale_type") === "challan_mode" ? "Create Sale (Challan)" : "Submit"))}
          </Button>
          <Button type="button" variant="destructive" onClick={() => form.reset()}>
            Reset
          </Button>
        </div>

        {/* Sticky bottom summary bar */}
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-amber-50 dark:bg-amber-950/30 px-4 py-2">
          <div className="mx-auto max-w-4xl flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-medium">
            <span>Items <strong>{watchItems.filter(i => i.product_id).length}</strong></span>
            <span>Total <strong>{formatCurrency(subtotal)}</strong></span>
            <span>Discount <strong>{formatCurrency(watchDiscount)}</strong></span>
            <span>Paid <strong>{formatCurrency(watchPaid)}</strong></span>
            <span className={dueAmount > 0 ? "text-destructive font-bold" : ""}>
              Due <strong>{formatCurrency(dueAmount)}</strong>
            </span>
            <span className="font-bold text-sm">
              Grand Total <strong>{formatCurrency(totalAmount)}</strong>
            </span>
          </div>
        </div>
      </form>
    </Form>
  );
};

export default SaleForm;
