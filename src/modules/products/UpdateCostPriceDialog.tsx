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
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { formatCurrency } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: string; name: string; sku: string } | null;
  currentCost: number;
  /** Kept for backwards compatibility; backend infers tenancy from JWT. */
  dealerId: string;
}

/**
 * Phase 3U-30: now calls POST /api/products/:id/cost-price, which performs
 * the stock update + audit log atomically server-side.
 */
const UpdateCostPriceDialog = ({ open, onOpenChange, product, currentCost }: Props) => {
  const [newCost, setNewCost] = useState("");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const cost = Number(newCost);
      if (!cost || cost < 0) throw new Error("Cost must be >= 0");
      if (!reason.trim()) throw new Error("Reason is required");
      if (!product) throw new Error("No product selected");

      const res = await vpsAuthedFetch(`/api/products/${product.id}/cost-price`, {
        method: "POST",
        body: JSON.stringify({ cost, reason: reason.trim() }),
      });
      const body = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((body as any)?.error || `Failed to update cost (${res.status})`);
      }
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
