import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useDealerId } from "@/hooks/useDealerId";
import { salesService } from "@/services/salesService";
import SaleForm from "@/modules/sales/SaleForm";
import type { SaleFormValues } from "@/modules/sales/saleSchema";
import type { SaleItemInput } from "@/services/salesService";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const CreateSalePage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dealerId = useDealerId();

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
      return { id: result!.id, sale_type: values.sale_type };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      if (data.sale_type === "challan_mode") {
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
      <SaleForm
        dealerId={dealerId}
        onSubmit={async (v) => { await mutation.mutateAsync(v); }}
        isLoading={mutation.isPending}
      />
    </div>
  );
};

export default CreateSalePage;
