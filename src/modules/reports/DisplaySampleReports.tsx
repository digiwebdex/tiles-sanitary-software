import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download } from "lucide-react";
import {
  displayStockService,
  sampleIssueService,
  type DisplayStockRow,
  type SampleIssueRow,
  type SampleStatus,
} from "@/services/displayStockService";
import { exportToExcel } from "@/lib/exportUtils";

interface Props {
  dealerId: string;
}

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "issued": return "default";
    case "partially_returned": return "secondary";
    case "returned": return "outline";
    case "damaged":
    case "lost": return "destructive";
    default: return "outline";
  }
};

const fmt = (q: number) => Number(q).toLocaleString();

/* ============================================================ */
/* Display Stock Report                                          */
/* ============================================================ */
export function DisplayStockReport({ dealerId }: Props) {
  const [rows, setRows] = useState<DisplayStockRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    displayStockService
      .list(dealerId)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [dealerId]);

  const exportRows = () =>
    exportToExcel(
      rows.map((r) => ({
        Product: r.product?.name ?? "",
        SKU: r.product?.sku ?? "",
        DisplayQty: Number(r.display_qty),
        Notes: r.notes ?? "",
        LastUpdated: r.updated_at?.slice(0, 10),
      })),
      [
        { header: "Product", key: "Product" },
        { header: "SKU", key: "SKU" },
        { header: "Display Qty", key: "DisplayQty", format: "number" },
        { header: "Notes", key: "Notes" },
        { header: "Last Updated", key: "LastUpdated" },
      ],
      "display-stock"
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Display Stock Report</CardTitle>
        <Button variant="outline" size="sm" onClick={exportRows} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" /> Export Excel
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Display Qty</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No display stock</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.product?.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.product?.sku}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.display_qty)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.notes ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.updated_at?.slice(0, 10)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ============================================================ */
/* Generic Sample Filter component                               */
/* ============================================================ */
interface SampleFilters {
  from: string;
  to: string;
  recipientType: string;
  status: string;
}

function useFilteredSamples(dealerId: string, filterFn: (s: SampleIssueRow) => boolean) {
  const [all, setAll] = useState<SampleIssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SampleFilters>({
    from: "", to: "", recipientType: "all", status: "all",
  });

  useEffect(() => {
    setLoading(true);
    sampleIssueService
      .list(dealerId)
      .then(setAll)
      .finally(() => setLoading(false));
  }, [dealerId]);

  const rows = useMemo(() => {
    return all.filter((s) => {
      if (filters.from && s.issue_date < filters.from) return false;
      if (filters.to && s.issue_date > filters.to) return false;
      if (filters.recipientType !== "all" && s.recipient_type !== filters.recipientType) return false;
      if (filters.status !== "all" && s.status !== filters.status) return false;
      return filterFn(s);
    });
  }, [all, filters, filterFn]);

  return { rows, loading, filters, setFilters };
}

function FilterBar({ filters, setFilters, showStatus = true }: {
  filters: SampleFilters;
  setFilters: (f: SampleFilters) => void;
  showStatus?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div>
        <label className="text-xs text-muted-foreground">From</label>
        <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">To</label>
        <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Recipient Type</label>
        <Select value={filters.recipientType} onValueChange={(v) => setFilters({ ...filters, recipientType: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="architect">Architect</SelectItem>
            <SelectItem value="contractor">Contractor</SelectItem>
            <SelectItem value="mason">Mason / Fitter</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {showStatus && (
        <div>
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="issued">Issued</SelectItem>
              <SelectItem value="partially_returned">Partially Returned</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
              <SelectItem value="damaged">Damaged</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function SampleRowsTable({ rows }: { rows: SampleIssueRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Issue Date</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Recipient</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Issued</TableHead>
          <TableHead className="text-right">Returned</TableHead>
          <TableHead className="text-right">Damaged</TableHead>
          <TableHead className="text-right">Lost</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No matching records</TableCell></TableRow>
        )}
        {rows.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="text-sm">{s.issue_date}</TableCell>
            <TableCell>
              <div className="font-medium">{s.product?.name}</div>
              <div className="text-xs text-muted-foreground">{s.product?.sku}</div>
            </TableCell>
            <TableCell>
              <div>{s.recipient_name}</div>
              {s.recipient_phone && <div className="text-xs text-muted-foreground">{s.recipient_phone}</div>}
            </TableCell>
            <TableCell className="text-sm capitalize">{s.recipient_type}</TableCell>
            <TableCell className="text-right font-mono">{fmt(s.quantity)}</TableCell>
            <TableCell className="text-right font-mono">{fmt(s.returned_qty)}</TableCell>
            <TableCell className="text-right font-mono">{fmt(s.damaged_qty)}</TableCell>
            <TableCell className="text-right font-mono">{fmt(s.lost_qty)}</TableCell>
            <TableCell>
              <Badge variant={statusVariant(s.status)}>{s.status.replace("_", " ")}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const SAMPLE_COLS = [
  { header: "Issue Date", key: "IssueDate" },
  { header: "Product", key: "Product" },
  { header: "SKU", key: "SKU" },
  { header: "Recipient", key: "Recipient" },
  { header: "Phone", key: "Phone" },
  { header: "Type", key: "Type" },
  { header: "Issued", key: "Issued", format: "number" as const },
  { header: "Returned", key: "Returned", format: "number" as const },
  { header: "Damaged", key: "Damaged", format: "number" as const },
  { header: "Lost", key: "Lost", format: "number" as const },
  { header: "Expected Return", key: "ExpectedReturn" },
  { header: "Returned Date", key: "ReturnedDate" },
  { header: "Status", key: "Status" },
  { header: "Notes", key: "Notes" },
];

const sampleExport = (rows: SampleIssueRow[], filename: string) =>
  exportToExcel(
    rows.map((s) => ({
      IssueDate: s.issue_date,
      Product: s.product?.name ?? "",
      SKU: s.product?.sku ?? "",
      Recipient: s.recipient_name,
      Phone: s.recipient_phone ?? "",
      Type: s.recipient_type,
      Issued: Number(s.quantity),
      Returned: Number(s.returned_qty),
      Damaged: Number(s.damaged_qty),
      Lost: Number(s.lost_qty),
      ExpectedReturn: s.expected_return_date ?? "",
      ReturnedDate: s.returned_date ?? "",
      Status: s.status,
      Notes: s.notes ?? "",
    })),
    SAMPLE_COLS,
    filename
  );

/* ============================================================ */
/* Issued Sample Report (all-time, default tab)                  */
/* ============================================================ */
export function IssuedSampleReport({ dealerId }: Props) {
  const { rows, loading, filters, setFilters } = useFilteredSamples(dealerId, () => true);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Issued Sample Report</CardTitle>
        <Button variant="outline" size="sm" onClick={() => sampleExport(rows, "issued-samples")} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilterBar filters={filters} setFilters={setFilters} />
        {loading ? <p className="text-center text-sm text-muted-foreground">Loading…</p> : <SampleRowsTable rows={rows} />}
      </CardContent>
    </Card>
  );
}

/* ============================================================ */
/* Returned Sample Report                                        */
/* ============================================================ */
export function ReturnedSampleReport({ dealerId }: Props) {
  const { rows, loading, filters, setFilters } = useFilteredSamples(
    dealerId,
    (s) => Number(s.returned_qty) > 0
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Returned Sample Report</CardTitle>
        <Button variant="outline" size="sm" onClick={() => sampleExport(rows, "returned-samples")} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilterBar filters={filters} setFilters={setFilters} />
        {loading ? <p className="text-center text-sm text-muted-foreground">Loading…</p> : <SampleRowsTable rows={rows} />}
      </CardContent>
    </Card>
  );
}

/* ============================================================ */
/* Damaged / Lost Sample Report                                  */
/* ============================================================ */
export function DamagedLostSampleReport({ dealerId }: Props) {
  const { rows, loading, filters, setFilters } = useFilteredSamples(
    dealerId,
    (s) => Number(s.damaged_qty) > 0 || Number(s.lost_qty) > 0 || s.status === "damaged" || s.status === "lost"
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Damaged / Lost Sample Report</CardTitle>
        <Button variant="outline" size="sm" onClick={() => sampleExport(rows, "damaged-lost-samples")} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilterBar filters={filters} setFilters={setFilters} />
        {loading ? <p className="text-center text-sm text-muted-foreground">Loading…</p> : <SampleRowsTable rows={rows} />}
      </CardContent>
    </Card>
  );
}

/* ============================================================ */
/* Sample Outstanding Report                                     */
/* ============================================================ */
export function SampleOutstandingReport({ dealerId }: Props) {
  const { rows, loading, filters, setFilters } = useFilteredSamples(
    dealerId,
    (s) => s.status === "issued" || s.status === "partially_returned"
  );

  const today = new Date();
  const enriched = rows.map((s) => ({
    ...s,
    daysOut: Math.floor((today.getTime() - new Date(s.issue_date).getTime()) / 86400000),
    overdue: s.expected_return_date && s.expected_return_date < today.toISOString().slice(0, 10),
  }));

  const exportRows = () =>
    exportToExcel(
      enriched.map((s) => ({
        IssueDate: s.issue_date,
        Product: s.product?.name ?? "",
        SKU: s.product?.sku ?? "",
        Recipient: s.recipient_name,
        Type: s.recipient_type,
        Outstanding:
          Number(s.quantity) - Number(s.returned_qty) - Number(s.damaged_qty) - Number(s.lost_qty),
        ExpectedReturn: s.expected_return_date ?? "",
        DaysOut: s.daysOut,
        Overdue: s.overdue ? "YES" : "",
      })),
      [
        { header: "Issue Date", key: "IssueDate" },
        { header: "Product", key: "Product" },
        { header: "SKU", key: "SKU" },
        { header: "Recipient", key: "Recipient" },
        { header: "Type", key: "Type" },
        { header: "Outstanding", key: "Outstanding", format: "number" },
        { header: "Expected Return", key: "ExpectedReturn" },
        { header: "Days Out", key: "DaysOut", format: "number" },
        { header: "Overdue", key: "Overdue" },
      ],
      "sample-outstanding"
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Sample Outstanding Report</CardTitle>
        <Button variant="outline" size="sm" onClick={exportRows} disabled={!enriched.length}>
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilterBar filters={filters} setFilters={setFilters} showStatus={false} />
        {loading ? (
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Expected Return</TableHead>
                <TableHead className="text-right">Days Out</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enriched.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No outstanding samples</TableCell></TableRow>
              )}
              {enriched.map((s) => {
                const out = Number(s.quantity) - Number(s.returned_qty) - Number(s.damaged_qty) - Number(s.lost_qty);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">{s.issue_date}</TableCell>
                    <TableCell>
                      <div className="font-medium">{s.product?.name}</div>
                      <div className="text-xs text-muted-foreground">{s.product?.sku}</div>
                    </TableCell>
                    <TableCell>
                      <div>{s.recipient_name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{s.recipient_type}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmt(out)}</TableCell>
                    <TableCell className="text-sm">{s.expected_return_date ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{s.daysOut}</TableCell>
                    <TableCell>
                      {s.overdue ? (
                        <Badge variant="destructive">Overdue</Badge>
                      ) : (
                        <Badge variant={statusVariant(s.status)}>{s.status.replace("_", " ")}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
