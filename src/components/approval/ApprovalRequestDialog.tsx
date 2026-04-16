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
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { ApprovalType, ApprovalContextData } from "@/services/approvalService";
import { APPROVAL_TYPE_LABELS } from "@/services/approvalService";
import { formatCurrency } from "@/lib/utils";

interface ApprovalRequestDialogProps {
  open: boolean;
  onClose: () => void;
  onRequestApproval: (reason: string) => Promise<void>;
  approvalType: ApprovalType;
  context: ApprovalContextData;
  isLoading?: boolean;
}

export function ApprovalRequestDialog({
  open,
  onClose,
  onRequestApproval,
  approvalType,
  context,
  isLoading,
}: ApprovalRequestDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onRequestApproval(reason);
      setReason("");
    } finally {
      setSubmitting(false);
    }
  };

  const renderContextDetails = () => {
    const details: string[] = [];

    if (context.customer_name) {
      details.push(`Customer: ${context.customer_name}`);
    }
    if (context.shortage_qty != null) {
      details.push(`Stock shortage: ${context.shortage_qty} units`);
    }
    if (context.mixed_shades?.length) {
      details.push(`Mixed shades: ${context.mixed_shades.join(", ")}`);
    }
    if (context.mixed_calibers?.length) {
      details.push(`Mixed calibers: ${context.mixed_calibers.join(", ")}`);
    }
    if (context.discount_pct != null) {
      details.push(`Discount: ${context.discount_pct}%`);
    }
    if (context.outstanding != null && context.credit_limit != null) {
      details.push(
        `Outstanding: ${formatCurrency(context.outstanding)} / Limit: ${formatCurrency(context.credit_limit)}`
      );
    }
    if (context.overdue_days != null) {
      details.push(`Overdue: ${context.overdue_days} days`);
    }
    if (context.items?.length) {
      for (const item of context.items) {
        details.push(`${item.product_name ?? item.product_id}: ${item.quantity} units`);
      }
    }

    return details;
  };

  const contextDetails = renderContextDetails();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-yellow-500" />
            Manager Approval Required
          </DialogTitle>
          <DialogDescription>
            This action requires approval from a manager before it can proceed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-yellow-600 border-yellow-400">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {APPROVAL_TYPE_LABELS[approvalType]}
            </Badge>
          </div>

          {contextDetails.length > 0 && (
            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
              {contextDetails.map((detail, i) => (
                <p key={i} className="text-muted-foreground">{detail}</p>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">Reason / Note</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this action is needed..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || isLoading}
            className="bg-yellow-600 hover:bg-yellow-700 text-white"
          >
            {submitting ? "Requesting..." : "Request Approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
