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
import { toast } from "sonner";
import { ApprovalContextSummary } from "./ApprovalContextSummary";

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

          <ApprovalContextSummary context={request.context_data} />

          {request.reason && (
            <div className="text-sm">
              <span className="font-medium">Requester's Note:</span>{" "}
              <span className="text-muted-foreground">{request.reason}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">
              Decision Note {isHighRisk ? "(Required for approval/rejection)" : "(Required for rejection)"}
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
