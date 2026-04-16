import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { useDealerId } from "@/hooks/useDealerId";
import { salesService } from "@/services/salesService";
import { quotationService } from "@/services/quotationService";
import SaleForm from "@/modules/sales/SaleForm";
import type { SaleFormValues } from "@/modules/sales/saleSchema";
import type { SaleItemInput } from "@/services/salesService";
import { toast } from "sonner";
import { ArrowLeft, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface QuotationPrefillState {
  quotation_id?: string;
  customer_name?: string;
  discount?: number;
  notes?: string;
  items?: Array<{ product_id: string; quantity: number; sale_rate: number }>;
}

const CreateSalePage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dealerId = useDealerId();
  const location = useLocation();
  const prefill = (location.state ?? {}) as QuotationPrefillState;
  const fromQuotation = !!prefill.quotation_id;

  const mutation = useMutation({
    mutationFn: async (values: SaleFormValues & { allow_backorder?: boolean; reservation_selections?: Record<string, Array<{ reservation_id: string; consume_qty: number }>> }) => {
      const result = await salesService.create({
        dealer_id: dealerId,
        customer_name: values.customer_name,
        sale_date: values.sale_date,
        sale_type: values.sale_type,
        discount: values.discount,
        discount_reference: values.discount_reference || "",
        client_reference: values.client_reference || "",
        fitter_reference: values.fitter_reference || "",
        paid_amount: values.paid_amount,
        notes: values.notes,
        items: values.items as SaleItemInput[],
        allow_backorder: values.allow_backorder,
        reservation_selections: values.reservation_selections,
      });
      // Link back to quotation if applicable
      if (fromQuotation && prefill.quotation_id && result?.id) {
        try {
          await quotationService.linkToSale(prefill.quotation_id, result.id, dealerId);
        } catch (e) {
          // Don't block the sale; surface a soft warning
          toast.warning("Sale created, but failed to mark quotation as converted: " + (e as Error).message);
        }
      }
      return { id: result!.id, sale_type: values.sale_type };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      if (fromQuotation) {
        toast.success("Quotation converted to sale");
      } else if (data.sale_type === "challan_mode") {
        toast.success("Sale created in challan mode (draft)");
      } else {
        toast.success("Sale confirmed & stock updated");
      }
      navigate("/sales");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/sales")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">New Sale</h1>
      </div>

      {fromQuotation && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <FileSignature className="h-4 w-4 text-primary" />
            <span>
              Converting from quotation. Items, customer, and discount have been prefilled. Stock, credit, and approval rules will be re-validated when you save.
            </span>
          </CardContent>
        </Card>
      )}

      <SaleForm
        dealerId={dealerId}
        onSubmit={async (v) => { await mutation.mutateAsync(v); }}
        isLoading={mutation.isPending}
        defaultValues={
          fromQuotation
            ? {
                customer_name: prefill.customer_name ?? "",
                discount: prefill.discount ?? 0,
                notes: prefill.notes ?? "",
                items:
                  prefill.items && prefill.items.length > 0
                    ? prefill.items
                    : [{ product_id: "", quantity: 0, sale_rate: 0 }],
              }
            : undefined
        }
      />
    </div>
  );
};

export default CreateSalePage;
