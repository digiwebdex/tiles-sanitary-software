import { Clock, CheckCircle, XCircle, AlertTriangle, ShieldCheck, Ban, PlayCircle } from "lucide-react";
import type { ApprovalRequest } from "@/services/approvalService";

interface Props {
  request: ApprovalRequest;
}

interface Step {
  icon: typeof Clock;
  label: string;
  at: string | null;
  note?: string | null;
  tone: "muted" | "info" | "success" | "danger" | "warning";
  active: boolean;
}

const toneClasses: Record<Step["tone"], string> = {
  muted: "text-muted-foreground bg-muted",
  info: "text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30",
  success: "text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30",
  danger: "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30",
  warning: "text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30",
};

/**
 * Compact lifecycle timeline for an approval request.
 * Shows: created → decided/auto → consumed/expired/stale/cancelled.
 */
export function ApprovalTimeline({ request }: Props) {
  const steps: Step[] = [];

  steps.push({
    icon: Clock,
    label: "Requested",
    at: request.created_at,
    note: request.reason,
    tone: "info",
    active: true,
  });

  if (request.status === "cancelled") {
    steps.push({
      icon: Ban,
      label: "Cancelled by requester/admin",
      at: request.decided_at,
      note: request.decision_note,
      tone: "muted",
      active: true,
    });
  } else if (request.status === "rejected") {
    steps.push({
      icon: XCircle,
      label: "Rejected",
      at: request.decided_at,
      note: request.decision_note,
      tone: "danger",
      active: true,
    });
  } else if (
    request.status === "approved" ||
    request.status === "auto_approved" ||
    request.status === "consumed" ||
    request.status === "stale" ||
    request.status === "expired"
  ) {
    if (request.decided_at || request.status === "auto_approved") {
      steps.push({
        icon: request.status === "auto_approved" ? ShieldCheck : CheckCircle,
        label: request.status === "auto_approved" ? "Auto-approved (admin)" : "Approved",
        at: request.decided_at,
        note: request.decision_note,
        tone: "success",
        active: true,
      });
    }

    if (request.consumed_at) {
      steps.push({
        icon: PlayCircle,
        label: "Used / executed",
        at: request.consumed_at,
        note: request.consumed_source_id ? `Bound to ${request.consumed_source_id.slice(0, 8)}…` : null,
        tone: "success",
        active: true,
      });
    } else if (request.status === "stale") {
      steps.push({
        icon: AlertTriangle,
        label: "Marked stale (action changed)",
        at: null,
        tone: "warning",
        active: true,
      });
    } else if (request.status === "expired") {
      steps.push({
        icon: AlertTriangle,
        label: "Expired before use",
        at: request.expires_at,
        tone: "warning",
        active: true,
      });
    }
  }

  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <div key={i} className="flex gap-3">
            <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${toneClasses[s.tone]}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{s.label}</p>
              {s.at && (
                <p className="text-xs text-muted-foreground">
                  {new Date(s.at).toLocaleString()}
                </p>
              )}
              {s.note && (
                <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-2">
                  "{s.note}"
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
