import { useQuery } from "@tanstack/react-query";
import { listPendingApprovals } from "@/services/approvalService";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";

interface PendingApprovalsBadgeProps {
  dealerId: string;
  onClick?: () => void;
}

export function PendingApprovalsBadge({ dealerId, onClick }: PendingApprovalsBadgeProps) {
  const { data: pending = [] } = useQuery({
    queryKey: ["pending-approvals-count", dealerId],
    queryFn: () => listPendingApprovals(dealerId),
    enabled: !!dealerId,
    refetchInterval: 30_000, // poll every 30s
  });

  if (pending.length === 0) return null;

  return (
    <button onClick={onClick} className="relative inline-flex items-center">
      <Badge
        variant="destructive"
        className="gap-1 cursor-pointer hover:bg-destructive/90"
      >
        <ShieldAlert className="h-3 w-3" />
        {pending.length} Pending
      </Badge>
    </button>
  );
}
