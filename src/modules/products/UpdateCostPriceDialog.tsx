import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";
import { formatCurrency } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: string; name: string; sku: string } | null;
  currentCost: number;
  dealerId: string;
}

const UpdateCostPriceDialog = ({ open, onOpenChange, product, currentCost, dealerId }: Props) => {
  const [newCost, setNewCost] = useState("");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const cost = Number(newCost);
      if (!cost || cost < 0) throw new Error("Cost must be >= 0");
      if (!reason.trim()) throw new Error("Reason is required");
      if (!product) throw new Error("No product selected");

      const { error } = await supabase
        .from("stock")
        .update({ average_cost_per_unit: cost })
        .eq("product_id", product.id)
        .eq("dealer_id", dealerId);
      if (error) throw new Error(error.message);

      await logAudit({
        dealer_id: dealerId,
        action: "cost_change",
        table_name: "stock",
        record_id: product.id,
        old_data: { average_cost_per_unit: currentCost },
        new_data: { average_cost_per_unit: cost, reason: reason.trim() },
      });
    },
    onSuccess: () => {
      toast.success("Cost price updated");
      qc.invalidateQueries({ queryKey: ["products-cost-map"] });
      setNewCost("");
      setReason("");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Update Cost Price</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <strong>{product.sku}</strong> — {product.name}
          </p>
          <p className="text-sm">Current Avg Cost: <strong>{formatCurrency(currentCost)}</strong></p>
          <div>
            <Label>New Cost Price *</Label>
            <Input type="number" step="0.01" min="0" value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="Enter new cost" />
          </div>
          <div>
            <Label>Reason *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Supplier price change…" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !newCost || !reason.trim()}>
            {mutation.isPending ? "Saving…" : "Update Cost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpdateCostPriceDialog;
