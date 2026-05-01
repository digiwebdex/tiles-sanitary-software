import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { APPROVAL_TYPE_LABELS, type ApprovalType } from "@/services/approvalService";

interface Props {
  dealerId: string;
}

interface PendingRow {
  id: string;
  approval_type: string;
  created_at: string;
  context_data: Record<string, any> | null;
  requested_by: string | null;
}

interface WidgetsResponse {
  pending: PendingRow[];
  todayDecisions: { approved: number; rejected: number; auto: number; total: number };
  typeSummary: { type: string; count: number }[];
}

export function ApprovalDashboardWidgets({ dealerId }: Props) {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["dashboard-approval-widgets", dealerId],
    queryFn: async (): Promise<WidgetsResponse> => {
      const res = await vpsAuthedFetch(
        `/api/dashboard/approval-widgets?dealerId=${encodeURIComponent(dealerId)}`,
      );
      if (!res.ok) throw new Error(`approval-widgets failed: ${res.status}`);
      return res.json();
    },
    enabled: !!dealerId,
    refetchInterval: 30_000,
  });

  const pending = data?.pending ?? [];
  const todayDecisions = data?.todayDecisions;
  const typeSummary = data?.typeSummary ?? [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Pending Approvals */}
      <Card className="border-yellow-200 dark:border-yellow-900/30">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-yellow-600" />
            Pending Approvals
          </CardTitle>
          <Badge
            variant={pending.length > 0 ? "destructive" : "secondary"}
            className="text-xs"
          >
            {pending.length}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No pending requests.</p>
          ) : (
            <div className="space-y-1">
              {pending.slice(0, 3).map((req) => {
                const ctx = (req.context_data ?? {}) as Record<string, any>;
                return (
                  <div
                    key={req.id}
                    className="text-xs flex items-center justify-between gap-2 border-b last:border-0 pb-1.5 last:pb-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {APPROVAL_TYPE_LABELS[req.approval_type as ApprovalType]}
                      </p>
                      {ctx?.customer_name && (
                        <p className="text-muted-foreground truncate">{ctx.customer_name}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-1"
            onClick={() => navigate("/approvals")}
          >
            <ShieldCheck className="h-3 w-3 mr-1" />
            Review All
          </Button>
        </CardContent>
      </Card>

      {/* Today's Decisions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Today's Decisions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <CheckCircle className="h-4 w-4 mx-auto text-green-600" />
              <p className="text-lg font-bold mt-1">{todayDecisions?.approved ?? 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Approved</p>
            </div>
            <div>
              <XCircle className="h-4 w-4 mx-auto text-destructive" />
              <p className="text-lg font-bold mt-1">{todayDecisions?.rejected ?? 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Rejected</p>
            </div>
            <div>
              <ShieldCheck className="h-4 w-4 mx-auto text-blue-600" />
              <p className="text-lg font-bold mt-1">{todayDecisions?.auto ?? 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Auto</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Type Summary (7d) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            Top Approval Types (7d)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {typeSummary.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No activity in the last 7 days.</p>
          ) : (
            <div className="space-y-1">
              {typeSummary.map((row) => (
                <div key={row.type} className="flex items-center justify-between text-xs">
                  <span className="text-foreground truncate">
                    {APPROVAL_TYPE_LABELS[row.type as ApprovalType]}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {row.count}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
