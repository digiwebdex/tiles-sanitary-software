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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, Ban } from "lucide-react";
import {
  APPROVAL_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  cancelApprovalRequest,
  type ApprovalRequest,
} from "@/services/approvalService";
import { ApprovalContextSummary } from "./ApprovalContextSummary";
import { ApprovalTimeline } from "./ApprovalTimeline";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  request: ApprovalRequest | null;
  onChanged?: () => void;
}

export function ApprovalDetailDialog({ open, onClose, request, onChanged }: Props) {
  const { user, isDealerAdmin } = useAuth();
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelInput, setShowCancelInput] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!request) return null;

  const canCancel =
    request.status === "pending" &&
    (request.requested_by === user?.id || isDealerAdmin);

  const handleCancel = async () => {
    if (!showCancelInput) {
      setShowCancelInput(true);
      return;
    }
    if (!cancelReason.trim()) {
      toast.error("Please provide a reason");
      return;
    }
    setBusy(true);
    try {
      await cancelApprovalRequest(request.id, cancelReason);
      toast.success("Approval request cancelled");
      onChanged?.();
      onClose();
      setShowCancelInput(false);
      setCancelReason("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const statusMessages: Record<string, string> = {
    pending: "Waiting for a dealer admin to approve or reject.",
    approved: "Approved — action can now be executed once.",
    auto_approved: "Auto-approved because an admin performed the action.",
    consumed: "This approval has been used and cannot be reused.",
    rejected: "Rejected — the underlying action stays blocked.",
    expired: "Expired before use — request a fresh approval if still needed.",
    stale: "The action changed since approval — request a fresh approval.",
    cancelled: "Cancelled by the requester or an admin.",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Approval Request
          </DialogTitle>
          <DialogDescription>{statusMessages[request.status] ?? ""}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{APPROVAL_TYPE_LABELS[request.approval_type]}</Badge>
            <Badge variant="secondary">{APPROVAL_STATUS_LABELS[request.status]}</Badge>
          </div>

          <ApprovalContextSummary context={request.context_data} />

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Lifecycle</p>
            <ApprovalTimeline request={request} />
          </div>

          {showCancelInput && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Cancellation reason</label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why are you cancelling this request?"
                rows={2}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {canCancel && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={busy}
            >
              <Ban className="h-4 w-4 mr-1" />
              {showCancelInput ? "Confirm cancel" : "Cancel request"}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
