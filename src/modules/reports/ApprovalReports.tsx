import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { exportToExcel } from "@/lib/exportUtils";
import { Download } from "lucide-react";
import {
  APPROVAL_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  type ApprovalType,
  type ApprovalStatus,
} from "@/services/approvalService";

interface Props {
  dealerId: string;
}

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  consumed: "default",
  auto_approved: "default",
  rejected: "destructive",
  expired: "outline",
  stale: "outline",
  cancelled: "outline",
};

// ─── Approval History Report ───────────────────────────────
export function ApprovalHistoryReport({ dealerId }: Props) {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-approval-history", dealerId, from, to, statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        dealerId, from, to, status: statusFilter, type: typeFilter,
      });
      const res = await vpsAuthedFetch(`/api/reports/approvals/history?${params.toString()}`);
      if (!res.ok) throw new Error(`approval history failed: ${res.status}`);
      const json = await res.json();
      return (json.rows ?? []) as any[];
    },
    enabled: !!dealerId,
  });

  const handleExport = () => {
    const exportData = rows.map((r) => ({
      date: new Date(r.created_at).toLocaleString(),
      type: APPROVAL_TYPE_LABELS[r.approval_type as ApprovalType] ?? r.approval_type,
      status: APPROVAL_STATUS_LABELS[r.status as ApprovalStatus] ?? r.status,
      customer: (r.context_data as any)?.customer_name ?? "—",
      reason: r.reason ?? "—",
      decision_note: r.decision_note ?? "—",
      decided_at: r.decided_at ? new Date(r.decided_at).toLocaleString() : "—",
      consumed_at: r.consumed_at ? new Date(r.consumed_at).toLocaleString() : "—",
    }));
    exportToExcel(
      exportData,
      [
        { header: "Date", key: "date" },
        { header: "Type", key: "type" },
        { header: "Status", key: "status" },
        { header: "Customer", key: "customer" },
        { header: "Reason", key: "reason" },
        { header: "Decision Note", key: "decision_note" },
        { header: "Decided At", key: "decided_at" },
        { header: "Consumed At", key: "consumed_at" },
      ],
      "approval-history"
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Approval History</CardTitle>
          <Button onClick={handleExport} variant="outline" size="sm" disabled={!rows.length}>
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {Object.entries(APPROVAL_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {Object.entries(APPROVAL_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No requests found.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Decision Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const ctx = r.context_data as Record<string, any>;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {APPROVAL_TYPE_LABELS[r.approval_type as ApprovalType] ?? r.approval_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant[r.status] ?? "secondary"} className="text-xs">
                          {APPROVAL_STATUS_LABELS[r.status as ApprovalStatus] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{ctx?.customer_name ?? "—"}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {r.reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {r.decision_note ?? "—"}
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
  );
}

// ─── Approval Type Summary Report ──────────────────────────
export function ApprovalTypeSummaryReport({ dealerId }: Props) {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ["report-approval-type-summary", dealerId, from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("approval_requests")
        .select("approval_type, status")
        .eq("dealer_id", dealerId)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`);

      const map = new Map<
        ApprovalType,
        { total: number; approved: number; rejected: number; pending: number; auto: number }
      >();

      for (const r of data ?? []) {
        const t = r.approval_type as ApprovalType;
        const cur = map.get(t) ?? { total: 0, approved: 0, rejected: 0, pending: 0, auto: 0 };
        cur.total++;
        if (r.status === "approved" || r.status === "consumed") cur.approved++;
        else if (r.status === "rejected") cur.rejected++;
        else if (r.status === "pending") cur.pending++;
        else if (r.status === "auto_approved") cur.auto++;
        map.set(t, cur);
      }

      return Array.from(map.entries())
        .map(([type, stats]) => ({ type, ...stats }))
        .sort((a, b) => b.total - a.total);
    },
    enabled: !!dealerId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Approval Type Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : summary.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No requests found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Approval Type</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Auto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.map((row) => (
                <TableRow key={row.type}>
                  <TableCell className="font-medium">
                    {APPROVAL_TYPE_LABELS[row.type]}
                  </TableCell>
                  <TableCell className="text-right">{row.total}</TableCell>
                  <TableCell className="text-right text-green-600">{row.approved}</TableCell>
                  <TableCell className="text-right text-destructive">{row.rejected}</TableCell>
                  <TableCell className="text-right text-yellow-600">{row.pending}</TableCell>
                  <TableCell className="text-right text-blue-600">{row.auto}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── User-wise Approval Stats ──────────────────────────────
export function UserApprovalStatsReport({ dealerId }: Props) {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-user-approval-stats", dealerId, from, to],
    queryFn: async () => {
      // Fetch all approvals in range
      const { data: approvals } = await supabase
        .from("approval_requests")
        .select("requested_by, decided_by, status")
        .eq("dealer_id", dealerId)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`);

      // Collect unique user IDs
      const userIds = new Set<string>();
      for (const a of approvals ?? []) {
        if (a.requested_by) userIds.add(a.requested_by);
        if (a.decided_by) userIds.add(a.decided_by);
      }

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", Array.from(userIds));

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      const userStats = new Map<
        string,
        { name: string; requested: number; approved: number; rejected: number }
      >();

      for (const a of approvals ?? []) {
        if (a.requested_by) {
          const user = profileMap.get(a.requested_by);
          const cur = userStats.get(a.requested_by) ?? {
            name: user?.name ?? user?.email ?? "Unknown",
            requested: 0,
            approved: 0,
            rejected: 0,
          };
          cur.requested++;
          userStats.set(a.requested_by, cur);
        }
        if (a.decided_by && (a.status === "approved" || a.status === "consumed")) {
          const user = profileMap.get(a.decided_by);
          const cur = userStats.get(a.decided_by) ?? {
            name: user?.name ?? user?.email ?? "Unknown",
            requested: 0,
            approved: 0,
            rejected: 0,
          };
          cur.approved++;
          userStats.set(a.decided_by, cur);
        }
        if (a.decided_by && a.status === "rejected") {
          const user = profileMap.get(a.decided_by);
          const cur = userStats.get(a.decided_by) ?? {
            name: user?.name ?? user?.email ?? "Unknown",
            requested: 0,
            approved: 0,
            rejected: 0,
          };
          cur.rejected++;
          userStats.set(a.decided_by, cur);
        }
      }

      return Array.from(userStats.entries())
        .map(([id, s]) => ({ id, ...s }))
        .sort((a, b) => (b.requested + b.approved + b.rejected) - (a.requested + a.approved + a.rejected));
    },
    enabled: !!dealerId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">User-wise Approval Statistics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No data found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Requests Made</TableHead>
                <TableHead className="text-right">Approved (as Reviewer)</TableHead>
                <TableHead className="text-right">Rejected (as Reviewer)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right">{row.requested}</TableCell>
                  <TableCell className="text-right text-green-600">{row.approved}</TableCell>
                  <TableCell className="text-right text-destructive">{row.rejected}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
