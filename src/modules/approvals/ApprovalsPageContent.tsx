import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDealerId } from "@/hooks/useDealerId";
import { useAuth } from "@/contexts/AuthContext";
import {
  listApprovals,
  APPROVAL_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  type ApprovalRequest,
  type ApprovalStatus,
  type ApprovalType,
} from "@/services/approvalService";
import { ApprovalDecisionDialog } from "@/components/approval/ApprovalDecisionDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ShieldCheck,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
} from "lucide-react";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  expired: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
  auto_approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  consumed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  stale: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
};

const statusIcons: Record<string, typeof Clock> = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  expired: AlertTriangle,
  auto_approved: ShieldCheck,
  consumed: CheckCircle,
  stale: AlertTriangle,
};

const ApprovalsPageContent = () => {
  const dealerId = useDealerId();
  const { isDealerAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ["approvals", dealerId, statusFilter, typeFilter],
    queryFn: () =>
      listApprovals(dealerId, {
        status: statusFilter === "all" ? undefined : statusFilter,
        type: typeFilter === "all" ? undefined : typeFilter,
      }),
    enabled: !!dealerId,
  });

  const handleDecided = () => {
    queryClient.invalidateQueries({ queryKey: ["approvals"] });
    queryClient.invalidateQueries({ queryKey: ["pending-approvals-count"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" />
          Approvals
        </h1>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-4 flex-wrap">
            <div className="w-48">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="consumed">Used</SelectItem>
                  <SelectItem value="auto_approved">Auto-Approved</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="stale">Stale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(APPROVAL_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            {approvals.length} request(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : approvals.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No approval requests found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvals.map((req) => {
                    const StatusIcon = statusIcons[req.status] ?? Clock;
                    const ctx = req.context_data as Record<string, any>;
                    return (
                      <TableRow key={req.id}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {APPROVAL_TYPE_LABELS[req.approval_type as ApprovalType] ?? req.approval_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                              statusColors[req.status] ?? ""
                            }`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {APPROVAL_STATUS_LABELS[req.status as ApprovalStatus] ?? req.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {req.source_type}
                          {ctx.customer_name && (
                            <span className="block text-foreground">{ctx.customer_name}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">
                          {req.reason || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(req.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {req.status === "pending" && isDealerAdmin ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedRequest(req)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Review
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedRequest(req)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ApprovalDecisionDialog
        open={!!selectedRequest && selectedRequest.status === "pending" && isDealerAdmin}
        onClose={() => setSelectedRequest(null)}
        request={selectedRequest}
        onDecided={handleDecided}
      />
    </div>
  );
};

export default ApprovalsPageContent;
