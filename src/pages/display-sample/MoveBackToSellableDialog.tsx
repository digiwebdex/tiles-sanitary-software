import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { displayStockService, type DisplayStockRow } from "@/services/displayStockService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: DisplayStockRow | null;
  dealerId: string;
  onSuccess: () => void;
}

type Action = "back_to_sellable" | "mark_damaged" | "replace";

export function MoveBackToSellableDialog({ open, onOpenChange, row, dealerId, onSuccess }: Props) {
  const [action, setAction] = useState<Action>("back_to_sellable");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && row) {
      setAction("back_to_sellable");
      setQty(String(Number(row.display_qty) || 1));
      setNotes("");
    }
  }, [open, row]);

  const handleSubmit = async () => {
    if (!row) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return toast.error("Quantity must be positive");
    if (action !== "replace" && n > Number(row.display_qty))
      return toast.error(`Only ${row.display_qty} on display`);

    setSubmitting(true);
    try {
      if (action === "back_to_sellable") {
        await displayStockService.moveBackToSellable(row.product_id, n, dealerId, notes || undefined);
        toast.success("Display stock moved back to sellable");
      } else if (action === "mark_damaged") {
        await displayStockService.markDisplayDamaged(row.product_id, n, dealerId, notes || undefined);
        toast.success("Display stock marked damaged");
      } else {
        await displayStockService.replaceDisplay(row.product_id, n, dealerId, notes || undefined);
        toast.success("Display unit replaced with fresh stock");
      }
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update display");
    } finally {
      setSubmitting(false);
    }
  };

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Display Stock</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium">{row.product?.name}</div>
            <div className="text-xs text-muted-foreground">SKU: {row.product?.sku}</div>
            <div className="mt-2 flex gap-2">
              <Badge variant="outline">On display: {Number(row.display_qty)}</Badge>
            </div>
          </div>

          <div>
            <Label>Action</Label>
            <RadioGroup value={action} onValueChange={(v) => setAction(v as Action)} className="mt-2 space-y-2">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="back_to_sellable" id="a-back" className="mt-1" />
                <label htmlFor="a-back" className="text-sm cursor-pointer">
                  <div className="font-medium">Move back to sellable</div>
                  <div className="text-xs text-muted-foreground">Display unit is still good — return to inventory.</div>
                </label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="mark_damaged" id="a-damaged" className="mt-1" />
                <label htmlFor="a-damaged" className="text-sm cursor-pointer">
                  <div className="font-medium">Mark damaged</div>
                  <div className="text-xs text-muted-foreground">Display unit is broken — remove from display.</div>
                </label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="replace" id="a-replace" className="mt-1" />
                <label htmlFor="a-replace" className="text-sm cursor-pointer">
                  <div className="font-medium">Replace with fresh stock</div>
                  <div className="text-xs text-muted-foreground">Damaged display swapped for new sellable unit.</div>
                </label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label>Quantity</Label>
            <Input type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
