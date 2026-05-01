import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel } from "@/lib/exportUtils";
import { Download } from "lucide-react";

async function vpsJson<T>(path: string): Promise<T> {
  const res = await vpsAuthedFetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

// ─── Revenue Collection Report ────────────────────────────
export function RevenueCollectionReport() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["sa-revenue-collection", fromDate, toDate],
    queryFn: async () => {
      // /api/subscriptions/payments returns enriched rows incl. dealer_name.
      // Filter by date client-side (server returns 500 most recent overall).
      const { payments } = await vpsJson<{ payments: any[] }>(
        "/api/subscriptions/payments"
      );
      const within = (payments ?? []).filter((p) => {
        if (!p.payment_date) return false;
        return p.payment_date >= fromDate && p.payment_date <= toDate;
      });
      return within.map((p) => ({
        id: p.id,
        payment_date: p.payment_date,
        amount: Number(p.amount ?? 0),
        payment_method: p.payment_method,
        payment_status: p.payment_status,
        note: p.note,
        dealer_id: p.dealer_id,
        subscription_id: p.subscription_id,
        dealer_name: p.dealer_name ?? "Unknown",
      }));
    },
  });

  const filtered = data.filter((r) => {
    if (statusFilter !== "all" && r.payment_status !== statusFilter) return false;
    if (methodFilter !== "all" && r.payment_method !== methodFilter) return false;
    return true;
  });

  const totals = {
    collected: filtered.filter((r) => r.payment_status === "paid").reduce((s, r) => s + Number(r.amount), 0),
    pending: filtered.filter((r) => r.payment_status === "pending").reduce((s, r) => s + Number(r.amount), 0),
    partial: filtered.filter((r) => r.payment_status === "partial").reduce((s, r) => s + Number(r.amount), 0),
  };

  const handleExport = () => {
    const cols = [
      { header: "Dealer", key: "dealer_name" },
      { header: "Date", key: "payment_date" },
      { header: "Amount", key: "amount", format: "currency" as const },
      { header: "Method", key: "payment_method" },
      { header: "Status", key: "payment_status" },
      { header: "Note", key: "note" },
    ];
    exportToExcel(filtered.map((r) => ({ ...r, amount: Number(r.amount), note: r.note ?? "" })), cols, "Revenue_Collection_Report");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Revenue Collection Report</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="mobile_banking">Mobile</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground">Collected</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(totals.collected)}</p>
          </div>
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-lg font-bold text-amber-600">{formatCurrency(totals.pending)}</p>
          </div>
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground">Partial</p>
            <p className="text-lg font-bold text-muted-foreground">{formatCurrency(totals.partial)}</p>
          </div>
        </div>

        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dealer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No payments found</TableCell></TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.dealer_name}</TableCell>
                    <TableCell>{r.payment_date}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(Number(r.amount))}</TableCell>
                    <TableCell className="capitalize">{r.payment_method.replace("_", " ")}</TableCell>
                    <TableCell>
                      <Badge variant={r.payment_status === "paid" ? "default" : r.payment_status === "pending" ? "destructive" : "secondary"}>
                        {r.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{r.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Subscription Status Report ───────────────────────────
export function SubscriptionStatusReport() {
  const [statusFilter, setStatusFilter] = useState("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["sa-subscription-status-report"],
    queryFn: async () => {
      const [subsBody, paymentsBody] = await Promise.all([
        vpsJson<{ subscriptions: any[] }>("/api/subscriptions"),
        vpsJson<{ payments: any[] }>("/api/subscriptions/payments"),
      ]);
      const subs = subsBody.subscriptions ?? [];
      const payments = paymentsBody.payments ?? [];

      const paymentMap = new Map<string, { date: string; amount: number }>();
      for (const p of payments) {
        if (!paymentMap.has(p.subscription_id)) {
          paymentMap.set(p.subscription_id, { date: p.payment_date, amount: Number(p.amount) });
        }
      }

      return subs.map((s: any) => {
        const daysRemaining = s.end_date ? Math.ceil((new Date(s.end_date).getTime() - Date.now()) / 86400000) : null;
        const lastPayment = paymentMap.get(s.id);
        let displayStatus = s.status as string;
        if (s.status === "active" && daysRemaining !== null && daysRemaining <= 7 && daysRemaining > 0) displayStatus = "expiring_soon";
        if (s.status === "active" && daysRemaining !== null && daysRemaining <= 0 && daysRemaining >= -3) displayStatus = "grace";

        return {
          id: s.id,
          dealer_name: dealerMap.get(s.dealer_id) ?? "Unknown",
          plan_name: planMap.get(s.plan_id) ?? "Unknown",
          status: s.status,
          display_status: displayStatus,
          start_date: s.start_date,
          end_date: s.end_date,
          days_remaining: daysRemaining,
          billing_cycle: s.billing_cycle,
          last_payment_date: lastPayment?.date ?? null,
          last_payment_amount: lastPayment?.amount ?? null,
        };
      });
    },
  });

  const filtered = data.filter((r) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "expiring_soon") return r.display_status === "expiring_soon";
    if (statusFilter === "grace") return r.display_status === "grace";
    return r.status === statusFilter;
  });

  const handleExport = () => {
    const cols = [
      { header: "Dealer", key: "dealer_name" },
      { header: "Plan", key: "plan_name" },
      { header: "Status", key: "display_status" },
      { header: "Start Date", key: "start_date" },
      { header: "End Date", key: "end_date" },
      { header: "Days Remaining", key: "days_remaining" },
      { header: "Billing", key: "billing_cycle" },
      { header: "Last Payment", key: "last_payment_date" },
      { header: "Last Amount", key: "last_payment_amount", format: "currency" as const },
    ];
    exportToExcel(filtered.map((r) => ({
      ...r,
      end_date: r.end_date ?? "N/A",
      days_remaining: r.days_remaining ?? "N/A",
      last_payment_date: r.last_payment_date ?? "N/A",
      last_payment_amount: r.last_payment_amount ?? 0,
    })), cols, "Subscription_Status_Report");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-primary/10 text-primary border-primary/20">Active</Badge>;
      case "expiring_soon": return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Expiring Soon</Badge>;
      case "grace": return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Grace</Badge>;
      case "expired": return <Badge variant="destructive">Expired</Badge>;
      case "suspended": return <Badge variant="destructive" className="bg-red-900 text-white">Suspended</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Subscription Status Report</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Filter status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
            <SelectItem value="grace">Grace</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>

        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dealer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Days Left</TableHead>
                  <TableHead>Last Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No subscriptions</TableCell></TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id} className={r.display_status === "expired" || r.display_status === "suspended" ? "bg-destructive/5" : r.display_status === "expiring_soon" || r.display_status === "grace" ? "bg-amber-50 dark:bg-amber-950/10" : ""}>
                    <TableCell className="font-medium">{r.dealer_name}</TableCell>
                    <TableCell>{r.plan_name}</TableCell>
                    <TableCell>{getStatusBadge(r.display_status)}</TableCell>
                    <TableCell className="text-sm">{r.start_date}</TableCell>
                    <TableCell className="text-sm">{r.end_date ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.days_remaining !== null ? (
                        <span className={r.days_remaining <= 0 ? "text-destructive" : r.days_remaining <= 7 ? "text-amber-600" : "text-primary"}>
                          {r.days_remaining}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.last_payment_date ? (
                        <>{r.last_payment_date} · {formatCurrency(r.last_payment_amount ?? 0)}</>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
