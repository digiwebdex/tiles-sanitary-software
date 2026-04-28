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
import { logAudit } from "@/services/auditService";
import { formatCurrency } from "@/lib/utils";
import { productService } from "@/services/productService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: string; name: string; sku: string; default_sale_rate: number } | null;
  dealerId: string;
}

const UpdateSalePriceDialog = ({ open, onOpenChange, product, dealerId }: Props) => {
  const [newPrice, setNewPrice] = useState("");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const price = Number(newPrice);
      if (!price || price <= 0) throw new Error("Price must be > 0");
      if (!reason.trim()) throw new Error("Reason is required for price changes");
      if (!product) throw new Error("No product selected");

      await productService.update(product.id, { default_sale_rate: price });

      await logAudit({
        dealer_id: dealerId,
        action: "price_change",
        table_name: "products",
        record_id: product.id,
        old_data: { default_sale_rate: product.default_sale_rate },
        new_data: { default_sale_rate: price, reason: reason.trim() },
      });
    },
    onSuccess: () => {
      toast.success("Sale price updated");
      qc.invalidateQueries({ queryKey: ["products"] });
      setNewPrice("");
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
          <DialogTitle>Update Sale Price</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <strong>{product.sku}</strong> — {product.name}
          </p>
          <p className="text-sm">Current Price: <strong>{formatCurrency(product.default_sale_rate)}</strong></p>
          <div>
            <Label>New Sale Price *</Label>
            <Input type="number" step="0.01" min="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="Enter new price" />
          </div>
          <div>
            <Label>Reason *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Market adjustment, seasonal…" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !newPrice || !reason.trim()}>
            {mutation.isPending ? "Saving…" : "Update Price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpdateSalePriceDialog;
