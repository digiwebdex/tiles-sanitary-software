import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CreditCheckResult } from "@/services/creditService";

interface CreditApprovalDialogProps {
  open: boolean;
  creditCheck: CreditCheckResult;
  customerName: string;
  onApprove: (reason: string) => void;
  onCancel: () => void;
}

export const CreditApprovalDialog = ({
  open,
  creditCheck,
  customerName,
  onApprove,
  onCancel,
}: CreditApprovalDialogProps) => {
  const [reason, setReason] = useState("");

  const handleApprove = () => {
    if (!reason.trim()) return;
    onApprove(reason.trim());
    setReason("");
  };

  const handleCancel = () => {
    setReason("");
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Credit Limit Override Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Alerts */}
          {creditCheck.is_credit_exceeded && (
            <div className="flex gap-3 rounded-md border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-red-800">Credit Limit Exceeded</p>
                <p className="text-red-700">
                  <strong>{customerName}</strong> has an outstanding of{" "}
                  <strong>{formatCurrency(creditCheck.current_outstanding)}</strong>. This sale will
                  bring the total to{" "}
                  <strong>{formatCurrency(creditCheck.projected_outstanding)}</strong>, exceeding the
                  credit limit of{" "}
                  <strong>{formatCurrency(creditCheck.credit_limit)}</strong>.
                </p>
              </div>
            </div>
          )}

          {creditCheck.is_overdue_violated && (
            <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-800">Overdue Alert</p>
                <p className="text-amber-700">
                  Customer has an overdue balance of{" "}
                  <strong>{creditCheck.overdue_days} days</strong> (max allowed:{" "}
                  <strong>{creditCheck.max_overdue_days} days</strong>).
                </p>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 text-sm">
            <span className="text-muted-foreground">Current Outstanding</span>
            <span className="font-medium text-right">{formatCurrency(creditCheck.current_outstanding)}</span>
            <span className="text-muted-foreground">This Sale (Due)</span>
            <span className="font-medium text-right">
              {formatCurrency(creditCheck.projected_outstanding - creditCheck.current_outstanding)}
            </span>
            <span className="text-muted-foreground">Projected Total</span>
            <span className="font-semibold text-right text-destructive">
              {formatCurrency(creditCheck.projected_outstanding)}
            </span>
            <span className="text-muted-foreground">Credit Limit</span>
            <span className="font-medium text-right">{formatCurrency(creditCheck.credit_limit)}</span>
          </div>

          {/* Override reason */}
          <div className="space-y-2">
            <Label htmlFor="override-reason" className="text-sm font-medium">
              Override Reason <span className="text-destructive">*</span>
              <span className="ml-1 text-xs font-normal text-muted-foreground">(logged for audit)</span>
            </Label>
            <Textarea
              id="override-reason"
              placeholder="Enter reason for override (e.g. long-standing customer, payment expected soon)…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel Sale
          </Button>
          <Button
            variant="destructive"
            onClick={handleApprove}
            disabled={!reason.trim()}
          >
            Approve Override & Proceed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
