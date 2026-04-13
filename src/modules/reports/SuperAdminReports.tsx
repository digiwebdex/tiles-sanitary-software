import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      const { data, error } = await supabase
        .from("subscription_payments")
        .select(`
          id, payment_date, amount, payment_method, payment_status, note,
          dealer_id, subscription_id
        `)
        .gte("payment_date", fromDate)
        .lte("payment_date", toDate)
        .order("payment_date", { ascending: false });
      if (error) throw error;

      // Get dealer names
      const dealerIds = [...new Set((data ?? []).map((d) => d.dealer_id))];
      const { data: dealers } = await supabase.from("dealers").select("id, name").in("id", dealerIds);
      const dealerMap = new Map((dealers ?? []).map((d) => [d.id, d.name]));

      return (data ?? []).map((p) => ({
        ...p,
        dealer_name: dealerMap.get(p.dealer_id) ?? "Unknown",
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
    exportToExcel(filtered.map((r) => ({
      Dealer: r.dealer_name,
      Date: r.payment_date,
      Amount: Number(r.amount),
      Method: r.payment_method,
      Status: r.payment_status,
      Note: r.note ?? "",
    })), "Revenue_Collection_Report");
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
      const { data: subs, error } = await supabase
        .from("subscriptions")
        .select(`
          id, status, start_date, end_date, billing_cycle,
          dealer_id, plan_id
        `)
        .order("start_date", { ascending: false });
      if (error) throw error;

      const dealerIds = [...new Set((subs ?? []).map((s) => s.dealer_id))];
      const planIds = [...new Set((subs ?? []).map((s) => s.plan_id))];

      const [dealersRes, plansRes, paymentsRes] = await Promise.all([
        supabase.from("dealers").select("id, name").in("id", dealerIds),
        supabase.from("plans").select("id, name").in("id", planIds),
        supabase.from("subscription_payments").select("subscription_id, payment_date, amount, payment_status").order("payment_date", { ascending: false }),
      ]);

      const dealerMap = new Map((dealersRes.data ?? []).map((d) => [d.id, d.name]));
      const planMap = new Map((plansRes.data ?? []).map((p) => [p.id, p.name]));
      const paymentMap = new Map<string, { date: string; amount: number }>();
      for (const p of paymentsRes.data ?? []) {
        if (!paymentMap.has(p.subscription_id)) {
          paymentMap.set(p.subscription_id, { date: p.payment_date, amount: Number(p.amount) });
        }
      }

      return (subs ?? []).map((s) => {
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
    exportToExcel(filtered.map((r) => ({
      Dealer: r.dealer_name,
      Plan: r.plan_name,
      Status: r.display_status,
      "Start Date": r.start_date,
      "End Date": r.end_date ?? "N/A",
      "Days Remaining": r.days_remaining ?? "N/A",
      Billing: r.billing_cycle,
      "Last Payment": r.last_payment_date ?? "N/A",
      "Last Amount": r.last_payment_amount ?? 0,
    })), "Subscription_Status_Report");
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
