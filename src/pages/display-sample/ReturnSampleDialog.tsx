import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { displayStockService, type SampleIssueRow } from "@/services/displayStockService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sample: SampleIssueRow | null;
  dealerId: string;
  onSuccess: () => void;
}

export function ReturnSampleDialog({ open, onOpenChange, sample, dealerId, onSuccess }: Props) {
  const [returnTo, setReturnTo] = useState<"sellable" | "display" | "damaged">("sellable");
  const [qty, setQty] = useState("0");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const remaining = sample
    ? Number(sample.quantity) -
      Number(sample.returned_qty) -
      Number(sample.damaged_qty) -
      Number(sample.lost_qty)
    : 0;

  useEffect(() => {
    if (open && sample) {
      setQty(String(remaining));
      setReturnTo("sellable");
      setNotes("");
    }
  }, [open, sample, remaining]);

  const handleSubmit = async () => {
    if (!sample) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return toast.error("Quantity must be positive");
    if (n > remaining) return toast.error(`Only ${remaining} units outstanding`);

    setSubmitting(true);
    try {
      await displayStockService.returnSample({
        sample_id: sample.id,
        dealer_id: dealerId,
        return_qty: n,
        return_to: returnTo,
        notes: notes || undefined,
      });
      toast.success(
        returnTo === "sellable"
          ? "Sample returned — added back to sellable stock"
          : returnTo === "display"
          ? "Sample returned — moved to display stock"
          : "Sample marked as damaged on return"
      );
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record return");
    } finally {
      setSubmitting(false);
    }
  };

  if (!sample) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return Sample</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium">{sample.product?.name}</div>
            <div className="text-xs text-muted-foreground">
              Recipient: {sample.recipient_name} ({sample.recipient_type})
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <Badge variant="outline">Issued: {Number(sample.quantity)}</Badge>
              <Badge variant="secondary">Outstanding: {remaining}</Badge>
            </div>
          </div>

          <div>
            <Label>Return Condition</Label>
            <RadioGroup value={returnTo} onValueChange={(v) => setReturnTo(v as typeof returnTo)} className="mt-2 space-y-2">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="sellable" id="r-sellable" className="mt-1" />
                <label htmlFor="r-sellable" className="text-sm cursor-pointer">
                  <div className="font-medium">Good — return to sellable stock</div>
                  <div className="text-xs text-muted-foreground">Unit is intact and ready to sell again.</div>
                </label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="display" id="r-display" className="mt-1" />
                <label htmlFor="r-display" className="text-sm cursor-pointer">
                  <div className="font-medium">Good — move to showroom display</div>
                  <div className="text-xs text-muted-foreground">Unit is intact and stays on display.</div>
                </label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="damaged" id="r-damaged" className="mt-1" />
                <label htmlFor="r-damaged" className="text-sm cursor-pointer">
                  <div className="font-medium">Damaged — non-sellable</div>
                  <div className="text-xs text-muted-foreground">Unit is unusable. Stock not restored.</div>
                </label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label>Quantity</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              max={remaining}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">Maximum {remaining}</p>
          </div>

          <div>
            <Label>Notes {returnTo === "damaged" && <span className="text-destructive">*</span>}</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={returnTo === "damaged" ? "Describe damage…" : "Optional notes"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Record Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
