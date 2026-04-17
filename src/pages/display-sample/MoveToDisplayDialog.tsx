import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { displayStockService } from "@/services/displayStockService";

interface Product {
  id: string;
  name: string;
  sku: string;
  unit_type: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string;
  onSuccess: () => void;
}

export function MoveToDisplayDialog({ open, onOpenChange, dealerId, onSuccess }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("products")
      .select("id, name, sku, unit_type")
      .eq("dealer_id", dealerId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => setProducts((data ?? []) as Product[]));
  }, [open, dealerId]);

  const reset = () => {
    setProductId("");
    setQuantity("1");
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!productId) return toast.error("Please select a product");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("Quantity must be positive");

    setSubmitting(true);
    try {
      await displayStockService.moveToDisplay(productId, qty, dealerId, notes || undefined);
      toast.success("Stock moved to display");
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move stock");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Sellable Stock to Display</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Select product…" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Quantity</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              This will deduct from sellable stock and increment display stock.
            </p>
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Front showroom shelf #3"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Moving…" : "Move to Display"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
