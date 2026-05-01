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
import { Download } from "lucide-react";
import { exportToExcel } from "@/lib/exportUtils";
import { formatCurrency } from "@/lib/utils";
import { formatQuotationDisplayNo, type QuotationStatus } from "@/services/quotationService";
import { QuotationStatusBadge } from "@/components/quotation/QuotationStatusBadge";

interface Props { dealerId: string }

const today = () => new Date().toISOString().split("T")[0];
const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
};

// ── 1. Quotation List by Status ──────────────────────────
export function QuotationListReport({ dealerId }: Props) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState<string>("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-quotations-list", dealerId, from, to, status],
    queryFn: async () => {
      const params = new URLSearchParams({
        dealerId, from, to, status,
      });
      const res = await vpsAuthedFetch(`/api/reports/quotations/list?${params.toString()}`);
      if (!res.ok) throw new Error(`quotations list failed: ${res.status}`);
      const json = await res.json();
      return (json.rows ?? []) as any[];
    },
  });

  const totals = rows.reduce(
    (acc: any, r: any) => {
      acc.count++;
      acc.value += Number(r.total_amount);
      return acc;
    },
    { count: 0, value: 0 }
  );

  const handleExport = () => {
    exportToExcel(
      rows.map((r: any) => ({
        quote_no: formatQuotationDisplayNo(r),
        customer: r.customers?.name ?? r.customer_name_text ?? "—",
        status: r.status,
        date: r.quote_date,
        valid_until: r.valid_until,
        total: Number(r.total_amount),
      })),
      [
        { header: "Quote No", key: "quote_no" },
        { header: "Customer", key: "customer" },
        { header: "Status", key: "status" },
        { header: "Date", key: "date" },
        { header: "Valid Until", key: "valid_until" },
        { header: "Total", key: "total", format: "currency" },
      ],
      "quotation-list"
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quotation List by Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div><label className="text-xs text-muted-foreground">From</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
          <div><label className="text-xs text-muted-foreground">To</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="revised">Revised</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>

        <div className="flex gap-4 text-sm">
          <Badge variant="secondary">{totals.count} quotes</Badge>
          <Badge variant="outline">Value: {formatCurrency(totals.value)}</Badge>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Valid Until</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No quotations</TableCell></TableRow>
            ) : rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{formatQuotationDisplayNo(r)}</TableCell>
                <TableCell>{r.customers?.name ?? r.customer_name_text ?? "—"}</TableCell>
                <TableCell>{r.quote_date}</TableCell>
                <TableCell>{r.valid_until}</TableCell>
                <TableCell><QuotationStatusBadge status={r.status as QuotationStatus} /></TableCell>
                <TableCell className="text-right">{formatCurrency(r.total_amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── 2. Quotation Conversion Report ───────────────────────
export function QuotationConversionReport({ dealerId }: Props) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());

  const { data, isLoading } = useQuery({
    queryKey: ["report-quotation-conversion", dealerId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ dealerId, from, to });
      const res = await vpsAuthedFetch(`/api/reports/quotations/conversion?${params.toString()}`);
      if (!res.ok) throw new Error(`quotation conversion failed: ${res.status}`);
      return res.json() as Promise<{
        finalizedCount: number; convertedCount: number;
        totalQuotedValue: number; convertedValue: number;
        conversionPct: number; avgDays: number;
      }>;
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Quotation Conversion Report</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 items-end">
          <div><label className="text-xs text-muted-foreground">From</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
          <div><label className="text-xs text-muted-foreground">To</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : data && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Finalized Quotes" value={String(data.finalizedCount)} />
            <Stat label="Converted Quotes" value={String(data.convertedCount)} />
            <Stat label="Conversion Rate" value={`${data.conversionPct.toFixed(1)}%`} />
            <Stat label="Quoted Value" value={formatCurrency(data.totalQuotedValue)} />
            <Stat label="Converted Value" value={formatCurrency(data.convertedValue)} />
            <Stat label="Avg Days to Convert" value={data.avgDays.toFixed(1)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 3. Expired Quotations ────────────────────────────────
export function ExpiredQuotationsReport({ dealerId }: Props) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-quotations-expired", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotations")
        .select("*, customers(name)")
        .eq("dealer_id", dealerId)
        .eq("status", "expired")
        .order("valid_until", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Expired Quotations</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Quote #</TableHead><TableHead>Customer</TableHead>
            <TableHead>Quote Date</TableHead><TableHead>Expired On</TableHead>
            <TableHead className="text-right">Lost Value</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              : rows.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No expired quotations</TableCell></TableRow>
              : rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{formatQuotationDisplayNo(r)}</TableCell>
                  <TableCell>{r.customers?.name ?? r.customer_name_text ?? "—"}</TableCell>
                  <TableCell>{r.quote_date}</TableCell>
                  <TableCell>{r.valid_until}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(r.total_amount)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── 4. Salesman Quotation Performance ────────────────────
export function SalesmanQuotationPerformance({ dealerId }: Props) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-quotation-salesman", dealerId, from, to],
    queryFn: async () => {
      const { data: quotes } = await supabase
        .from("quotations")
        .select("created_by, status, total_amount")
        .eq("dealer_id", dealerId)
        .gte("quote_date", from)
        .lte("quote_date", to);
      const { data: profs } = await supabase
        .from("profiles").select("id, name").eq("dealer_id", dealerId);
      const nameMap = new Map((profs ?? []).map((p) => [p.id, p.name]));
      const agg = new Map<string, { name: string; quotes: number; converted: number; value: number; convertedValue: number }>();
      for (const q of quotes ?? []) {
        const key = q.created_by ?? "unknown";
        const cur = agg.get(key) ?? { name: nameMap.get(key as string) ?? "Unknown", quotes: 0, converted: 0, value: 0, convertedValue: 0 };
        cur.quotes++;
        cur.value += Number(q.total_amount);
        if (q.status === "converted") { cur.converted++; cur.convertedValue += Number(q.total_amount); }
        agg.set(key, cur);
      }
      return Array.from(agg.values()).sort((a, b) => b.value - a.value);
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Salesman Quotation Performance</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Salesman</TableHead>
            <TableHead className="text-right">Quotes</TableHead>
            <TableHead className="text-right">Converted</TableHead>
            <TableHead className="text-right">Conv %</TableHead>
            <TableHead className="text-right">Quoted Value</TableHead>
            <TableHead className="text-right">Converted Value</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              : rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No data</TableCell></TableRow>
              : rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">{r.quotes}</TableCell>
                  <TableCell className="text-right">{r.converted}</TableCell>
                  <TableCell className="text-right">{r.quotes > 0 ? ((r.converted / r.quotes) * 100).toFixed(1) : "0.0"}%</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.value)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.convertedValue)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── 5. Top Quoted Products ───────────────────────────────
export function TopQuotedProductsReport({ dealerId }: Props) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-top-quoted-products", dealerId, from, to],
    queryFn: async () => {
      const { data: items } = await supabase
        .from("quotation_items")
        .select("product_name_snapshot, quantity, line_total, quotations!inner(dealer_id, quote_date, status)")
        .eq("dealer_id", dealerId)
        .gte("quotations.quote_date", from)
        .lte("quotations.quote_date", to)
        .neq("quotations.status", "draft")
        .neq("quotations.status", "cancelled");
      const agg = new Map<string, { name: string; qty: number; value: number; count: number }>();
      for (const it of items ?? []) {
        const key = it.product_name_snapshot;
        const cur = agg.get(key) ?? { name: key, qty: 0, value: 0, count: 0 };
        cur.qty += Number(it.quantity);
        cur.value += Number(it.line_total);
        cur.count++;
        agg.set(key, cur);
      }
      return Array.from(agg.values()).sort((a, b) => b.value - a.value).slice(0, 25);
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Top Quoted Products</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Times Quoted</TableHead>
            <TableHead className="text-right">Total Qty</TableHead>
            <TableHead className="text-right">Total Value</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              : rows.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No data</TableCell></TableRow>
              : rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right">{r.qty}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.value)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </div>
  );
}
