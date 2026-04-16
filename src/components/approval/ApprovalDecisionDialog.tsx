import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, ShieldCheck } from "lucide-react";
import type { ApprovalRequest } from "@/services/approvalService";
import {
  APPROVAL_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  decideApprovalRequest,
} from "@/services/approvalService";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface ApprovalDecisionDialogProps {
  open: boolean;
  onClose: () => void;
  request: ApprovalRequest | null;
  onDecided?: () => void;
}

export function ApprovalDecisionDialog({
  open,
  onClose,
  request,
  onDecided,
}: ApprovalDecisionDialogProps) {
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState(false);

  if (!request) return null;

  const ctx = request.context_data as Record<string, any>;
  const isHighRisk = ["credit_override", "sale_cancel", "stock_adjustment"].includes(
    request.approval_type
  );

  const handleDecision = async (decision: "approved" | "rejected") => {
    if (decision === "rejected" && !note.trim()) {
      toast.error("Rejection note is mandatory");
      return;
    }
    if (decision === "approved" && isHighRisk && !note.trim()) {
      toast.error("Approval note is mandatory for this action type");
      return;
    }

    setDeciding(true);
    try {
      await decideApprovalRequest(request.id, decision, note || undefined);
      toast.success(`Request ${decision}`);
      setNote("");
      onDecided?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeciding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Review Approval Request
          </DialogTitle>
          <DialogDescription>
            Approve or reject this request with a decision note.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">
              {APPROVAL_TYPE_LABELS[request.approval_type as keyof typeof APPROVAL_TYPE_LABELS]}
            </Badge>
            <Badge variant="secondary">
              <Clock className="h-3 w-3 mr-1" />
              {APPROVAL_STATUS_LABELS[request.status as keyof typeof APPROVAL_STATUS_LABELS]}
            </Badge>
          </div>

          {/* Context summary */}
          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            {ctx.customer_name && (
              <p>
                <span className="font-medium">Customer:</span> {ctx.customer_name}
              </p>
            )}
            {ctx.shortage_qty != null && (
              <p>
                <span className="font-medium">Shortage:</span> {ctx.shortage_qty} units
              </p>
            )}
            {ctx.mixed_shades?.length > 0 && (
              <p>
                <span className="font-medium">Mixed Shades:</span>{" "}
                {ctx.mixed_shades.join(", ")}
              </p>
            )}
            {ctx.mixed_calibers?.length > 0 && (
              <p>
                <span className="font-medium">Mixed Calibers:</span>{" "}
                {ctx.mixed_calibers.join(", ")}
              </p>
            )}
            {ctx.discount_pct != null && (
              <p>
                <span className="font-medium">Discount:</span> {ctx.discount_pct}%
              </p>
            )}
            {ctx.outstanding != null && (
              <p>
                <span className="font-medium">Outstanding:</span>{" "}
                {formatCurrency(ctx.outstanding)}
                {ctx.credit_limit != null && ` / Limit: ${formatCurrency(ctx.credit_limit)}`}
              </p>
            )}
            {ctx.items?.length > 0 && (
              <div>
                <span className="font-medium">Items:</span>
                <ul className="list-disc list-inside ml-2">
                  {ctx.items.map((item: any, i: number) => (
                    <li key={i}>
                      {item.product_name ?? item.product_id}: {item.quantity} units
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {request.reason && (
            <div className="text-sm">
              <span className="font-medium">Requester's Note:</span>{" "}
              <span className="text-muted-foreground">{request.reason}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">
              Decision Note {isHighRisk || "rejected" ? "(Required for rejection)" : "(Optional)"}
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Enter your decision note..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={deciding}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleDecision("rejected")}
            disabled={deciding}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Reject
          </Button>
          <Button
            onClick={() => handleDecision("approved")}
            disabled={deciding}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
