import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { sampleIssueService, type SampleIssueRow } from "@/services/displayStockService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sample: SampleIssueRow | null;
  dealerId: string;
  onSuccess: () => void;
}

export function MarkLostSampleDialog({ open, onOpenChange, sample, dealerId, onSuccess }: Props) {
  const [qty, setQty] = useState("0");
  const [reason, setReason] = useState("");
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
      setReason("");
    }
  }, [open, sample, remaining]);

  const handleSubmit = async () => {
    if (!sample) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return toast.error("Quantity must be positive");
    if (n > remaining) return toast.error(`Only ${remaining} units outstanding`);
    if (!reason.trim()) return toast.error("Reason is required");

    setSubmitting(true);
    try {
      await sampleIssueService.markSampleLost({
        sample_id: sample.id,
        dealer_id: dealerId,
        lost_qty: n,
        reason: reason.trim(),
      });
      toast.success("Sample marked as lost");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark lost");
    } finally {
      setSubmitting(false);
    }
  };

  if (!sample) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Sample as Lost</DialogTitle>
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

          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Lost samples remain traceable in the audit log. Sellable stock will NOT be restored.
          </div>

          <div>
            <Label>Quantity Lost</Label>
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
            <Label>
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Recipient unreachable, sample not returned after 60 days"
              required
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Mark Lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
