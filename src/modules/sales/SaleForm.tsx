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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Search, AlertTriangle, ShieldAlert } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { checkCreditBeforeSale, logCreditOverride, type CreditCheckResult } from "@/services/creditService";
import { CreditStatusBadge } from "@/components/CreditStatusBadge";
import { CreditApprovalDialog } from "@/components/CreditApprovalDialog";
import { useAuth } from "@/contexts/AuthContext";

interface SaleFormProps {
  dealerId: string;
  onSubmit: (values: SaleFormValues) => Promise<void>;
  isLoading?: boolean;
}

const SaleForm = ({ dealerId, onSubmit, isLoading }: SaleFormProps) => {
  const { user, isDealerAdmin } = useAuth();
  const [skuSearch, setSkuSearch] = useState("");
  const [creditCheck, setCreditCheck] = useState<CreditCheckResult | null>(null);
  const [pendingValues, setPendingValues] = useState<SaleFormValues | null>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [creditCheckLoading, setCreditCheckLoading] = useState(false);

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
        .select("id, name, type, credit_limit, max_overdue_days")
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

  // Fetch stock for live profit preview (owner only)
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

  const filteredProducts = (() => {
    if (!skuSearch.trim()) return products;
    const q = skuSearch.toLowerCase();
    return products.filter(
      (p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    );
  })();

  const watchItems = form.watch("items");
  const watchDiscount = form.watch("discount") || 0;
  const watchPaid = form.watch("paid_amount") || 0;
  const watchCustomerId = form.watch("customer_id");

  const selectedCustomer = customers.find((c) => c.id === watchCustomerId);

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

  const subtotal = watchItems.reduce((s, item, idx) => s + calcItemTotal(idx), 0);
  const totalAmount = subtotal - watchDiscount;
  const dueAmount = Math.max(0, totalAmount - watchPaid);

  // Estimated COGS for live profit preview (owner only)
  const estimatedCogs = watchItems.reduce((acc, item) => {
    if (!item.product_id || !item.quantity) return acc;
    const avgCost = stockMap.get(item.product_id) ?? 0;
    return acc + item.quantity * avgCost;
  }, 0);
  const estimatedGrossProfit = totalAmount - estimatedCogs;

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

  /** Intercept submit to run credit check first */
  const handleFormSubmit = async (values: SaleFormValues) => {
    if (!values.customer_id) {
      await onSubmit(values);
      return;
    }

    setCreditCheckLoading(true);
    try {
      const check = await checkCreditBeforeSale(values.customer_id, dealerId, dueAmount);
      setCreditCheck(check);

      if (check.is_credit_exceeded || check.is_overdue_violated) {
        setPendingValues(values);
        setShowApprovalDialog(true);
      } else {
        await onSubmit(values);
        setCreditCheck(null);
      }
    } finally {
      setCreditCheckLoading(false);
    }
  };

  const handleApproveOverride = async (reason: string) => {
    if (!pendingValues) return;
    setShowApprovalDialog(false);

    // Submit sale first
    await onSubmit(pendingValues);

    // Then log override (fire-and-forget; sale is already committed)
    if (creditCheck && watchCustomerId && user?.id) {
      void logCreditOverride({
        dealer_id: dealerId,
        customer_id: watchCustomerId,
        sale_id: "", // sale_id not available here — logged without it
        override_reason: reason,
        overridden_by: user.id,
        credit_limit_at_time: creditCheck.credit_limit,
        outstanding_at_time: creditCheck.current_outstanding,
        new_due_at_time: dueAmount,
      });
    }

    setCreditCheck(null);
    setPendingValues(null);
  };

  const handleCancelOverride = () => {
    setShowApprovalDialog(false);
    setPendingValues(null);
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
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

          {/* Credit status for selected customer */}
          {selectedCustomer && watchCustomerId && (
            <CreditInlineStatus
              customerId={watchCustomerId}
              dealerId={dealerId}
              creditLimit={Number(selectedCustomer.credit_limit ?? 0)}
              maxOverdueDays={Number(selectedCustomer.max_overdue_days ?? 0)}
              projectedDue={dueAmount}
            />
          )}

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
              const itemTotal = calcItemTotal(idx);

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

          <Button type="submit" disabled={isLoading || creditCheckLoading} className="w-full md:w-auto">
            {creditCheckLoading ? "Checking Credit…" : isLoading ? "Processing…" : "Confirm Sale"}
          </Button>
        </form>
      </Form>

      {/* Credit Approval Dialog */}
      {showApprovalDialog && creditCheck && (
        <CreditApprovalDialog
          open={showApprovalDialog}
          creditCheck={creditCheck}
          customerName={selectedCustomer?.name ?? "Customer"}
          onApprove={handleApproveOverride}
          onCancel={handleCancelOverride}
        />
      )}
    </>
  );
};

/** Inline credit status widget shown below customer selector */
const CreditInlineStatus = ({
  customerId,
  dealerId,
  creditLimit,
  maxOverdueDays,
  projectedDue,
}: {
  customerId: string;
  dealerId: string;
  creditLimit: number;
  maxOverdueDays: number;
  projectedDue: number;
}) => {
  const { data: check } = useQuery({
    queryKey: ["credit-check-inline", customerId, dealerId],
    queryFn: () => checkCreditBeforeSale(customerId, dealerId, 0),
    enabled: !!customerId && !!dealerId,
    staleTime: 30_000,
  });

  if (!check) return null;

  const isWarning = check.is_credit_exceeded || check.is_overdue_violated;
  const projectedExceeds = creditLimit > 0 && (check.current_outstanding + projectedDue) > creditLimit;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Credit Status:</span>
        <CreditStatusBadge
          outstanding={check.current_outstanding}
          creditLimit={check.credit_limit}
          overdueDays={check.overdue_days}
          maxOverdueDays={check.max_overdue_days}
          showTooltip={true}
        />
        <span className="text-muted-foreground ml-auto text-xs">
          Outstanding: <strong className="text-foreground">{formatCurrency(check.current_outstanding)}</strong>
          {creditLimit > 0 && (
            <> / Limit: <strong className="text-foreground">{formatCurrency(creditLimit)}</strong></>
          )}
        </span>
      </div>
      {projectedExceeds && projectedDue > 0 && (
        <Alert className="border-destructive/50 bg-destructive/5">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive text-sm">
            This sale will exceed the credit limit. Owner approval will be required.
          </AlertDescription>
        </Alert>
      )}
      {check.is_overdue_violated && (
        <Alert className="border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-foreground text-sm">
            Customer has an overdue balance of <strong>{check.overdue_days} days</strong>{" "}
            (max: {check.max_overdue_days} days). Owner approval will be required.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default SaleForm;
