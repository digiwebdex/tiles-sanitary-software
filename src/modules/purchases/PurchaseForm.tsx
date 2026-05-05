import React from "react";
import { Link } from "react-router-dom";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { purchaseSchema, type PurchaseFormValues } from "@/modules/purchases/purchaseSchema";
import { useQuery } from "@tanstack/react-query";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
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
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Search, Package, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { SupplierAdvisoryHint } from "@/components/SupplierAdvisoryHint";

interface LastPurchaseInfo {
  purchase_rate: number;
  landed_cost: number;
  purchase_date: string;
  supplier_name: string;
}

interface PurchaseFormProps {
  dealerId: string;
  showOfferPrice: boolean;
  onSubmit: (values: PurchaseFormValues) => Promise<void>;
  isLoading?: boolean;
}

const PurchaseForm = ({ dealerId, showOfferPrice, onSubmit, isLoading }: PurchaseFormProps) => {
  const [productSearch, setProductSearch] = useState("");

  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      supplier_id: "",
      invoice_number: "",
      purchase_date: new Date().toISOString().split("T")[0],
      notes: "",
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // Phase 3U-30: VPS GET /api/suppliers.
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", dealerId],
    queryFn: async () => {
      const res = await vpsAuthedFetch(
        `/api/suppliers?dealerId=${dealerId}&pageSize=500&orderBy=name&orderDir=asc`,
      );
      const body = await res.json().catch(() => ({} as any));
      return ((body as any)?.rows ?? []) as { id: string; name: string }[];
    },
    enabled: !!dealerId,
  });

  // Phase 3U-30: VPS GET /api/products (active).
  const { data: products = [] } = useQuery({
    queryKey: ["products-active", dealerId],
    queryFn: async () => {
      const res = await vpsAuthedFetch(
        `/api/products?dealerId=${dealerId}&pageSize=500&orderBy=name&orderDir=asc&f.active=true`,
      );
      const body = await res.json().catch(() => ({} as any));
      return ((body as any)?.rows ?? []) as Array<{
        id: string;
        name: string;
        sku: string;
        unit_type: string;
        per_box_sft: number | null;
        category: string;
      }>;
    },
    enabled: !!dealerId,
  });

  // Phase 3U-30: VPS GET /api/products/last-purchase-map (dealer_admin only).
  const { data: lastPurchaseMap = new Map<string, LastPurchaseInfo>() } = useQuery({
    queryKey: ["products-last-purchase-info", dealerId],
    queryFn: async () => {
      const res = await vpsAuthedFetch(
        `/api/products/last-purchase-map?dealerId=${dealerId}`,
      );
      if (!res.ok) return new Map<string, LastPurchaseInfo>();
      const body = await res.json().catch(() => ({} as any));
      const obj = (body ?? {}) as Record<string, LastPurchaseInfo>;
      return new Map<string, LastPurchaseInfo>(Object.entries(obj));
    },
    enabled: !!dealerId,
  });

  // Phase 3U-30: VPS GET /api/products/cost-map (dealer_admin only).
  const { data: avgCostMap = new Map<string, number>() } = useQuery({
    queryKey: ["products-avg-cost", dealerId],
    queryFn: async () => {
      const res = await vpsAuthedFetch(`/api/products/cost-map?dealerId=${dealerId}`);
      if (!res.ok) return new Map<string, number>();
      const body = await res.json().catch(() => ({} as any));
      const obj = (body ?? {}) as Record<string, number>;
      return new Map<string, number>(
        Object.entries(obj).map(([k, v]) => [k, Number(v) || 0]),
      );
    },
    enabled: !!dealerId,
  });

  const watchItems = form.watch("items");
  const watchSupplierId = form.watch("supplier_id");

  const getItemProduct = (productId: string) =>
    products.find((p) => p.id === productId);

  const calcBaseCost = (idx: number) => {
    const item = watchItems[idx];
    if (!item) return 0;
    const product = getItemProduct(item.product_id);
    if (product?.unit_type === "box_sft" && product.per_box_sft) {
      // box_qty × per_box_sft × rate_per_sft
      return (item.quantity || 0) * product.per_box_sft * (item.purchase_rate || 0);
    }
    // piece: qty × rate
    return (item.quantity || 0) * (item.purchase_rate || 0);
  };

  const calcLandedCost = (idx: number) => {
    const item = watchItems[idx];
    if (!item) return 0;
    const baseCost = calcBaseCost(idx);
    return baseCost + (item.transport_cost || 0) + (item.labor_cost || 0) + (item.other_cost || 0);
  };

  const calcLandedCostPerSft = (idx: number) => {
    const totalSft = calcTotalSft(idx);
    if (!totalSft || totalSft === 0) return null;
    return calcLandedCost(idx) / totalSft;
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

  const filteredProducts = products.filter((p) => {
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  const addProduct = (productId: string) => {
    if (watchItems.some((item) => item.product_id === productId)) return;
    append({
      product_id: productId,
      quantity: 0,
      purchase_rate: 0,
      offer_price: 0,
      transport_cost: 0,
      labor_cost: 0,
      other_cost: 0,
      batch_no: "",
      lot_no: "",
      shade_code: "",
      caliber: "",
    });
    setProductSearch("");
  };

  const grandTotal = watchItems.reduce((s, _, i) => s + calcLandedCost(i), 0);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Top section: Reference, Date */}
        <Card>
          <CardContent className="pt-5">
            <p className="mb-4 text-sm text-muted-foreground">
              Please fill in the information below. The field labels marked with <span className="text-destructive">*</span> are required input fields.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="invoice_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference No</FormLabel>
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
                    <FormLabel>Purchase Date <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Supplier selection */}
        <Alert className="border-accent bg-accent/50">
          <AlertDescription className="text-accent-foreground">
            Please select a supplier before adding any product
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="pt-5">
            <FormField
              control={form.control}
              name="supplier_id"
              render={({ field }) => (
                <FormItem className="max-w-sm">
                  <FormLabel>Supplier <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Supplier" />
                      </SelectTrigger>
                    </FormControl>
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
            {watchSupplierId && (
              <SupplierAdvisoryHint dealerId={dealerId} supplierId={watchSupplierId} />
            )}
          </CardContent>
        </Card>

        {/* Product search bar */}
        <Card>
          <CardContent className="pt-5">
            <div className="relative">
              <div className="flex items-center gap-2 rounded-md border bg-background">
                <Package className="ml-3 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Search products by name or SKU to add..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="border-0 shadow-none focus-visible:ring-0"
                  disabled={!watchSupplierId}
                />
                <Search className="mr-3 h-4 w-4 text-muted-foreground" />
              </div>
              {productSearch.trim() && watchSupplierId && (
                <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-lg">
                  {filteredProducts.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No products found</div>
                  ) : (
                    filteredProducts.map((p) => {
                      const lastInfo = lastPurchaseMap.get(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                          onClick={() => addProduct(p.id)}
                          disabled={watchItems.some((item) => item.product_id === p.id)}
                        >
                          <span className="font-medium">{p.sku}</span>
                          <span className="text-muted-foreground">— {p.name}</span>
                          {lastInfo && (
                            <span className="ml-auto text-xs text-primary font-medium">
                              Last: {formatCurrency(lastInfo.purchase_rate)}
                            </span>
                          )}
                          {watchItems.some((item) => item.product_id === p.id) && (
                            <span className={`${lastInfo ? '' : 'ml-auto'} text-xs text-muted-foreground`}>(added)</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            {!watchSupplierId && (
              <p className="mt-2 text-xs text-muted-foreground">Select a supplier first to add products</p>
            )}
          </CardContent>
        </Card>

        {/* Items table */}
        {fields.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-24">Qty (Box/Pc)</TableHead>
                      <TableHead className="w-28">Rate (/SFT or /Pc)</TableHead>
                      {showOfferPrice && <TableHead className="w-28">Offer Price</TableHead>}
                      <TableHead className="w-24">Transport</TableHead>
                      <TableHead className="w-24">Labor</TableHead>
                      <TableHead className="w-24">Other</TableHead>
                      <TableHead className="w-24">SFT</TableHead>
                      <TableHead className="w-28 text-right">Landed Cost</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, idx) => {
                      const product = getItemProduct(watchItems[idx]?.product_id);
                      const totalSft = calcTotalSft(idx);
                      const landedCost = calcLandedCost(idx);
                      const lastInfo = product ? lastPurchaseMap.get(product.id) : undefined;
                      const avgCost = product ? avgCostMap.get(product.id) : undefined;
                      const currentRate = watchItems[idx]?.purchase_rate || 0;
                      const rateChanged = lastInfo && lastInfo.purchase_rate > 0 && currentRate > 0 && currentRate !== lastInfo.purchase_rate;

                      return (
                        <React.Fragment key={field.id}>
                        <TableRow>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{product?.name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{product?.sku}</div>
                            {lastInfo && (
                              <div className="text-xs text-primary font-medium mt-0.5">
                                Last Rate: {formatCurrency(lastInfo.purchase_rate)} ({formatDate(lastInfo.purchase_date)}) - {lastInfo.supplier_name}
                              </div>
                            )}
                            {avgCost !== undefined && avgCost > 0 && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Avg Cost: {formatCurrency(avgCost)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${idx}.quantity`}
                              render={({ field: f }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <Input type="number" step="0.01" className="h-8 text-sm" {...f} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${idx}.purchase_rate`}
                              render={({ field: f }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <Input type="number" step="0.01" className="h-8 text-sm" {...f} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            {rateChanged && (
                              <Badge variant="outline" className="mt-1 text-[10px] border-destructive/50 text-destructive gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Rate changed
                              </Badge>
                            )}
                          </TableCell>
                          {showOfferPrice && (
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`items.${idx}.offer_price`}
                                render={({ field: f }) => (
                                  <FormItem className="space-y-0">
                                    <FormControl>
                                      <Input type="number" step="0.01" className="h-8 text-sm" {...f} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                          )}
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${idx}.transport_cost`}
                              render={({ field: f }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <Input type="number" step="0.01" className="h-8 text-sm" {...f} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${idx}.labor_cost`}
                              render={({ field: f }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <Input type="number" step="0.01" className="h-8 text-sm" {...f} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${idx}.other_cost`}
                              render={({ field: f }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <Input type="number" step="0.01" className="h-8 text-sm" {...f} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </TableCell>
                          <TableCell className="text-sm">
                            {totalSft !== null ? (
                              <div>
                                <div>{totalSft.toFixed(2)}</div>
                                {product?.unit_type === "box_sft" && product.per_box_sft && watchItems[idx] && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5">
                                    {watchItems[idx].quantity} × {product.per_box_sft} sft
                                    {watchItems[idx].purchase_rate > 0 && (
                                      <> × {formatCurrency(watchItems[idx].purchase_rate)} = {formatCurrency(calcBaseCost(idx))}</>
                                    )}
                                  </div>
                                )}
                                {(() => {
                                  const lcPerSft = calcLandedCostPerSft(idx);
                                  return lcPerSft !== null && lcPerSft > 0 ? (
                                    <div className="text-[10px] text-primary font-medium mt-0.5">
                                      Landed/SFT: {formatCurrency(lcPerSft)}
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium text-sm">
                            {formatCurrency(landedCost)}
                          </TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(idx)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        {/* Batch fields row */}
                        {product?.category === "tiles" && (
                          <TableRow className="bg-muted/20 border-b">
                            <TableCell></TableCell>
                            <TableCell colSpan={showOfferPrice ? 9 : 8}>
                              <div className="flex flex-wrap gap-2 py-1">
                                <FormField
                                  control={form.control}
                                  name={`items.${idx}.batch_no`}
                                  render={({ field: f }) => (
                                    <FormItem className="space-y-0">
                                      <FormControl>
                                        <Input placeholder="Batch No" className="h-7 text-xs w-28" {...f} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name={`items.${idx}.shade_code`}
                                  render={({ field: f }) => (
                                    <FormItem className="space-y-0">
                                      <FormControl>
                                        <Input placeholder="Shade" className="h-7 text-xs w-20" {...f} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name={`items.${idx}.caliber`}
                                  render={({ field: f }) => (
                                    <FormItem className="space-y-0">
                                      <FormControl>
                                        <Input placeholder="Caliber" className="h-7 text-xs w-20" {...f} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name={`items.${idx}.lot_no`}
                                  render={({ field: f }) => (
                                    <FormItem className="space-y-0">
                                      <FormControl>
                                        <Input placeholder="Lot No" className="h-7 text-xs w-24" {...f} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <span className="text-[10px] text-muted-foreground self-center">Batch/Shade tracking</span>
                              </div>
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {fields.length === 0 && watchSupplierId && (
          <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
            <Package className="mx-auto mb-2 h-8 w-8" />
            <p>Please add products to order list</p>
            <p className="mt-1 text-xs">Use the search bar above to find and add products</p>
          </div>
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-5">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Add purchase notes..." rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Submit / Reset buttons */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isLoading || fields.length === 0}>
            {isLoading ? "Saving…" : "Submit"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => form.reset()}
            disabled={isLoading}
          >
            Reset
          </Button>
        </div>

        {/* Summary footer */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border bg-accent/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Items <strong className="text-foreground">{fields.length}</strong></span>
          <span className="text-muted-foreground">Total <strong className="text-foreground">{formatCurrency(watchItems.reduce((s, _, i) => s + calcBaseCost(i), 0))}</strong></span>
          <span className="text-muted-foreground">Transport <strong className="text-foreground">{formatCurrency(watchItems.reduce((s, item) => s + (item.transport_cost || 0), 0))}</strong></span>
          <span className="text-muted-foreground">Labor <strong className="text-foreground">{formatCurrency(watchItems.reduce((s, item) => s + (item.labor_cost || 0), 0))}</strong></span>
          <span className="text-muted-foreground">Other <strong className="text-foreground">{formatCurrency(watchItems.reduce((s, item) => s + (item.other_cost || 0), 0))}</strong></span>
          <span className="ml-auto font-semibold text-foreground">Grand Total <strong>{formatCurrency(grandTotal)}</strong></span>
        </div>
      </form>
    </Form>
  );
};

export default PurchaseForm;
