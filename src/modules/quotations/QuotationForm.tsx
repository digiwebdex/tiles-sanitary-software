import { useState, useMemo, useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, ArrowLeft, Save, FileCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { useDealerId } from "@/hooks/useDealerId";
import { useAuth } from "@/contexts/AuthContext";
import { customerService } from "@/services/customerService";
import { productService } from "@/services/productService";
import { quotationService, type Quotation, type QuotationItem } from "@/services/quotationService";
import { quotationFormSchema, type QuotationFormInput } from "./quotationSchema";
import { formatCurrency } from "@/lib/utils";

interface Props {
  initialQuotation?: Quotation;
  initialItems?: QuotationItem[];
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const inDaysISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const QuotationForm = ({ initialQuotation, initialItems }: Props) => {
  const navigate = useNavigate();
  const dealerId = useDealerId();
  const { user } = useAuth();
  const isEdit = !!initialQuotation;

  const { data: customersResp } = useQuery({
    queryKey: ["customers-for-quotation", dealerId],
    queryFn: () => customerService.list(dealerId, "", "", 1),
  });
  const { data: productsResp } = useQuery({
    queryKey: ["products-for-quotation", dealerId],
    queryFn: () => productService.list(dealerId, "", 1),
  });

  const customers = customersResp?.data ?? [];
  const products = useMemo(() => (productsResp?.data ?? []).filter((p) => p.active), [productsResp]);

  const form = useForm<QuotationFormInput>({
    resolver: zodResolver(quotationFormSchema),
    defaultValues: {
      customer_id: initialQuotation?.customer_id ?? null,
      customer_name_text: initialQuotation?.customer_name_text ?? "",
      customer_phone_text: initialQuotation?.customer_phone_text ?? "",
      customer_address_text: initialQuotation?.customer_address_text ?? "",
      quote_date: initialQuotation?.quote_date ?? todayISO(),
      valid_until: initialQuotation?.valid_until ?? inDaysISO(7),
      discount_type: (initialQuotation?.discount_type as "flat" | "percent") ?? "flat",
      discount_value: Number(initialQuotation?.discount_value ?? 0),
      notes: initialQuotation?.notes ?? "",
      terms_text: initialQuotation?.terms_text ?? "",
      items:
        initialItems?.map((it) => ({
          id: it.id,
          product_id: it.product_id,
          product_name_snapshot: it.product_name_snapshot,
          product_sku_snapshot: it.product_sku_snapshot,
          unit_type: it.unit_type,
          per_box_sft: it.per_box_sft,
          quantity: Number(it.quantity),
          rate: Number(it.rate),
          discount_value: Number(it.discount_value),
          line_total: Number(it.line_total),
          preferred_shade_code: it.preferred_shade_code,
          preferred_caliber: it.preferred_caliber,
          preferred_batch_no: it.preferred_batch_no,
          notes: it.notes,
          sort_order: it.sort_order,
        })) ?? [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = form.watch("items");
  const watchedDiscountType = form.watch("discount_type");
  const watchedDiscountValue = form.watch("discount_value");

  const subtotal = (watchedItems ?? []).reduce(
    (s, it) => s + Math.max(0, Number(it.quantity || 0) * Number(it.rate || 0) - Number(it.discount_value || 0)),
    0,
  );
  const discountAmount =
    watchedDiscountType === "percent"
      ? (subtotal * Number(watchedDiscountValue || 0)) / 100
      : Number(watchedDiscountValue || 0);
  const total = Math.max(0, subtotal - discountAmount);

  const customerId = form.watch("customer_id");
  const selectedCustomer = customers.find((c) => c.id === customerId);

  // When customer chosen from list, autofill walk-in fields
  useEffect(() => {
    if (selectedCustomer) {
      form.setValue("customer_name_text", selectedCustomer.name);
      form.setValue("customer_phone_text", selectedCustomer.phone ?? "");
      form.setValue("customer_address_text", selectedCustomer.address ?? "");
    }
  }, [selectedCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

  const addProductLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    append({
      product_id: p.id,
      product_name_snapshot: p.name,
      product_sku_snapshot: p.sku,
      unit_type: p.unit_type as "box_sft" | "piece",
      per_box_sft: p.per_box_sft,
      quantity: 1,
      rate: Number(p.default_sale_rate ?? 0),
      discount_value: 0,
      line_total: Number(p.default_sale_rate ?? 0),
      preferred_shade_code: null,
      preferred_caliber: null,
      preferred_batch_no: null,
      notes: null,
      sort_order: fields.length,
    });
  };

  const addBlankLine = () => {
    append({
      product_id: null,
      product_name_snapshot: "",
      product_sku_snapshot: null,
      unit_type: "piece",
      per_box_sft: null,
      quantity: 1,
      rate: 0,
      discount_value: 0,
      line_total: 0,
      preferred_shade_code: null,
      preferred_caliber: null,
      preferred_batch_no: null,
      notes: null,
      sort_order: fields.length,
    });
  };

  const saveDraftMutation = useMutation({
    mutationFn: async (data: QuotationFormInput) => {
      if (isEdit) {
        await quotationService.updateDraft(initialQuotation!.id, dealerId, data);
        return initialQuotation!.id;
      }
      const created = await quotationService.createDraft(dealerId, user?.id ?? null, data);
      return created.id;
    },
    onSuccess: (id) => {
      toast.success(isEdit ? "Quotation updated" : "Draft saved");
      navigate(`/quotations`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finalizeMutation = useMutation({
    mutationFn: async (data: QuotationFormInput) => {
      let id = initialQuotation?.id;
      if (isEdit) {
        await quotationService.updateDraft(initialQuotation!.id, dealerId, data);
      } else {
        const created = await quotationService.createDraft(dealerId, user?.id ?? null, data);
        id = created.id;
      }
      const finalized = await quotationService.finalize(id!, dealerId);
      return finalized;
    },
    onSuccess: () => {
      toast.success("Quote finalized");
      navigate(`/quotations`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSaveDraft = form.handleSubmit((data) => saveDraftMutation.mutate(data));
  const onFinalize = form.handleSubmit((data) => finalizeMutation.mutate(data));

  const isSaving = saveDraftMutation.isPending || finalizeMutation.isPending;
  const isLockedForEdit =
    isEdit && initialQuotation && initialQuotation.status !== "draft";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/quotations")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-xl font-bold">{isEdit ? "Edit Quotation" : "New Quotation"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onSaveDraft} disabled={isSaving || !!isLockedForEdit}>
            <Save className="h-4 w-4 mr-1" /> Save Draft
          </Button>
          <Button onClick={onFinalize} disabled={isSaving || !!isLockedForEdit}>
            <FileCheck className="h-4 w-4 mr-1" /> Finalize Quote
          </Button>
        </div>
      </div>

      {isLockedForEdit && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="text-sm py-3">
            This quotation is <strong>{initialQuotation?.status}</strong> and cannot be edited. Use "Revise" from the detail view to change it.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Customer (optional)</Label>
            <Controller
              control={form.control}
              name="customer_id"
              render={({ field }) => (
                <Select value={field.value ?? "__walkin"} onValueChange={(v) => field.onChange(v === "__walkin" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Pick customer or walk-in" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__walkin">Walk-in (enter manually)</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.customer_id && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.customer_id.message as string}</p>
            )}
          </div>
          <div>
            <Label>Walk-in / Customer Name</Label>
            <Input {...form.register("customer_name_text")} placeholder="e.g. Mr. Karim" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input {...form.register("customer_phone_text")} placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <Label>Address</Label>
            <Input {...form.register("customer_address_text")} placeholder="Site / delivery address" />
          </div>
          <div>
            <Label>Quote Date</Label>
            <Input type="date" {...form.register("quote_date")} />
          </div>
          <div>
            <Label>Valid Until</Label>
            <Input type="date" {...form.register("valid_until")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Items</span>
            <div className="flex items-center gap-2">
              <Select onValueChange={addProductLine}>
                <SelectTrigger className="w-72"><SelectValue placeholder="Add product…" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={addBlankLine}>
                <Plus className="h-4 w-4 mr-1" /> Custom Line
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No items yet. Add a product or a custom line.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-2">Description</th>
                    <th className="py-2 px-2 w-24">Qty</th>
                    <th className="py-2 px-2 w-28">Rate</th>
                    <th className="py-2 px-2 w-28">Line Disc.</th>
                    <th className="py-2 px-2 w-28 text-right">Total</th>
                    <th className="py-2 pl-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, idx) => {
                    const it = watchedItems?.[idx];
                    const lineTotal = it ? Math.max(0, Number(it.quantity || 0) * Number(it.rate || 0) - Number(it.discount_value || 0)) : 0;
                    return (
                      <tr key={f.id} className="border-b align-top">
                        <td className="py-2 pr-2 space-y-1">
                          <Input {...form.register(`items.${idx}.product_name_snapshot`)} placeholder="Product name" />
                          <Input {...form.register(`items.${idx}.product_sku_snapshot`)} placeholder="SKU (optional)" className="text-xs" />
                          <div className="grid grid-cols-3 gap-1">
                            <Input {...form.register(`items.${idx}.preferred_shade_code`)} placeholder="Shade" className="text-xs" />
                            <Input {...form.register(`items.${idx}.preferred_caliber`)} placeholder="Caliber" className="text-xs" />
                            <Input {...form.register(`items.${idx}.preferred_batch_no`)} placeholder="Batch" className="text-xs" />
                          </div>
                          <Input {...form.register(`items.${idx}.notes`)} placeholder="Line note (optional)" className="text-xs" />
                        </td>
                        <td className="py-2 px-2">
                          <Input type="number" step="0.01" {...form.register(`items.${idx}.quantity`)} />
                          <Controller
                            control={form.control}
                            name={`items.${idx}.unit_type`}
                            render={({ field }) => (
                              <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="piece">piece</SelectItem>
                                  <SelectItem value="box_sft">box_sft</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input type="number" step="0.01" {...form.register(`items.${idx}.rate`)} />
                        </td>
                        <td className="py-2 px-2">
                          <Input type="number" step="0.01" {...form.register(`items.${idx}.discount_value`)} />
                        </td>
                        <td className="py-2 px-2 text-right font-semibold">{formatCurrency(lineTotal)}</td>
                        <td className="py-2 pl-2">
                          <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {form.formState.errors.items && (
            <p className="text-xs text-destructive mt-2">{form.formState.errors.items.message as string}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Totals & Notes</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <Label>Notes</Label>
              <Textarea {...form.register("notes")} placeholder="Internal/customer notes" rows={3} />
            </div>
            <div>
              <Label>Terms & Conditions</Label>
              <Textarea {...form.register("terms_text")} placeholder="Validity, payment terms, delivery scope…" rows={3} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Discount Type</Label>
                <Controller
                  control={form.control}
                  name="discount_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flat">Flat amount</SelectItem>
                        <SelectItem value="percent">Percent (%)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div>
                <Label>Discount Value</Label>
                <Input type="number" step="0.01" {...form.register("discount_value")} />
              </div>
            </div>
            <Separator />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive">({formatCurrency(discountAmount)})</span></div>
              <Separator />
              <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatCurrency(total)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default QuotationForm;
