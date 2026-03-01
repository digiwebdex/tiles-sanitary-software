import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useDealerId } from "@/hooks/useDealerId";
import { salesService } from "@/services/salesService";
import SaleForm from "@/modules/sales/SaleForm";
import type { SaleFormValues } from "@/modules/sales/saleSchema";
import type { SaleItemInput } from "@/services/salesService";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const EditSalePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dealerId = useDealerId();

  const { data: sale, isLoading: loading } = useQuery({
    queryKey: ["sale", id],
    queryFn: () => salesService.getById(id!),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async (values: SaleFormValues) => {
      await salesService.update(id!, {
        dealer_id: dealerId,
        customer_name: values.customer_name,
        sale_date: values.sale_date,
        discount: values.discount,
        discount_reference: values.discount_reference || "",
        client_reference: values.client_reference || "",
        fitter_reference: values.fitter_reference || "",
        paid_amount: values.paid_amount,
        notes: values.notes,
        items: values.items as SaleItemInput[],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["sale", id] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Invoice updated successfully");
      navigate(`/sales/${id}/invoice`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (loading) return <p className="p-6 text-muted-foreground">Loading…</p>;
  if (!sale) return <p className="p-6 text-destructive">Sale not found</p>;

  const customer = (sale as any).customers;
  const saleItems = ((sale as any).sale_items ?? []).map((si: any) => ({
    product_id: si.product_id,
    quantity: Number(si.quantity),
    sale_rate: Number(si.sale_rate),
  }));

  const defaultValues: Partial<SaleFormValues> = {
    customer_name: customer?.name ?? "",
    sale_date: sale.sale_date,
    sale_type: ((sale as any).sale_type as any) ?? "direct_invoice",
    discount: Number(sale.discount),
    discount_reference: sale.discount_reference ?? "",
    client_reference: sale.client_reference ?? "",
    fitter_reference: sale.fitter_reference ?? "",
    paid_amount: Number(sale.paid_amount),
    notes: sale.notes ?? "",
    items: saleItems,
  };

  return (
    <div className="container mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/sales/${id}/invoice`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Edit Invoice</h1>
        <span className="text-sm font-mono text-muted-foreground">{sale.invoice_number}</span>
      </div>
      <SaleForm
        dealerId={dealerId}
        onSubmit={async (v) => { await mutation.mutateAsync(v); }}
        isLoading={mutation.isPending}
        defaultValues={defaultValues}
        submitLabel="Update Invoice"
        priceLocked={Number(sale.paid_amount) > 0}
      />
    </div>
  );
};

export default EditSalePage;
