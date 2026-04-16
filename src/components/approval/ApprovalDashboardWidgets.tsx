import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { APPROVAL_TYPE_LABELS, type ApprovalType } from "@/services/approvalService";

interface Props {
  dealerId: string;
}

export function ApprovalDashboardWidgets({ dealerId }: Props) {
  const navigate = useNavigate();

  const { data: pending = [] } = useQuery({
    queryKey: ["dashboard-approvals-pending", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("approval_requests")
        .select("id, approval_type, created_at, context_data, requested_by")
        .eq("dealer_id", dealerId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!dealerId,
    refetchInterval: 30_000,
  });

  const { data: todayDecisions } = useQuery({
    queryKey: ["dashboard-approvals-today", dealerId],
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from("approval_requests")
        .select("status")
        .eq("dealer_id", dealerId)
        .gte("decided_at", startOfDay.toISOString());

      const approved = (data ?? []).filter((r) => r.status === "approved" || r.status === "consumed").length;
      const rejected = (data ?? []).filter((r) => r.status === "rejected").length;
      const auto = (data ?? []).filter((r) => r.status === "auto_approved").length;
      return { approved, rejected, auto, total: (data ?? []).length };
    },
    enabled: !!dealerId,
    refetchInterval: 60_000,
  });

  const { data: typeSummary = [] } = useQuery({
    queryKey: ["dashboard-approvals-type-summary", dealerId],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await supabase
        .from("approval_requests")
        .select("approval_type")
        .eq("dealer_id", dealerId)
        .gte("created_at", sevenDaysAgo);

      const counts = new Map<ApprovalType, number>();
      for (const r of data ?? []) {
        const t = r.approval_type as ApprovalType;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    },
    enabled: !!dealerId,
    refetchInterval: 60_000,
  });

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
                const ctx = req.context_data as Record<string, any>;
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
                    {APPROVAL_TYPE_LABELS[row.type]}
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
