import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDealerId } from "@/hooks/useDealerId";
import { useAuth } from "@/contexts/AuthContext";
import { purchaseReturnService } from "@/services/purchaseReturnService";
import PurchaseReturnForm from "@/modules/purchase-returns/PurchaseReturnForm";
import type { PurchaseReturnFormValues } from "@/modules/purchase-returns/purchaseReturnSchema";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

const CreatePurchaseReturn = () => {
  const dealerId = useDealerId();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const { data: returnNo } = useQuery({
    queryKey: ["next-return-no", dealerId],
    queryFn: () => purchaseReturnService.getNextReturnNo(dealerId),
    enabled: !!dealerId,
  });

  const handleSubmit = async (values: PurchaseReturnFormValues) => {
    setSaving(true);
    try {
      await purchaseReturnService.create({
        dealer_id: dealerId,
        supplier_id: values.supplier_id,
        purchase_id: values.purchase_id || undefined,
        return_date: values.return_date,
        return_no: returnNo ?? "PR-0001",
        notes: values.notes,
        created_by: user?.id,
        items: values.items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          reason: item.reason,
        })),
      });
      toast({ title: "Purchase return created successfully" });
      navigate("/purchase-returns");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-foreground">
        New Purchase Return {returnNo && <span className="text-muted-foreground text-base ml-2">({returnNo})</span>}
      </h1>
      <PurchaseReturnForm dealerId={dealerId} onSubmit={handleSubmit} isLoading={saving} />
    </div>
  );
};

export default CreatePurchaseReturn;
