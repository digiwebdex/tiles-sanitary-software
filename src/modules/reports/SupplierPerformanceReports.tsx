import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import {
  supplierPerformanceService,
  type ReliabilityBand,
  type SupplierPerformance,
} from "@/services/supplierPerformanceService";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel } from "@/lib/exportUtils";
import { usePermissions } from "@/hooks/usePermissions";
import { Download, Truck, Search, AlertTriangle, ShieldCheck, Wallet, Clock } from "lucide-react";

interface Props {
  dealerId: string;
}

const BAND_BADGE: Record<ReliabilityBand, string> = {
  reliable: "bg-emerald-100 text-emerald-800 border-emerald-300",
  average: "bg-blue-100 text-blue-800 border-blue-300",
  at_risk: "bg-destructive/10 text-destructive border-destructive/30",
  inactive: "bg-muted text-muted-foreground",
};

const BAND_LABEL: Record<ReliabilityBand, string> = {
  reliable: "Reliable",
  average: "Average",
  at_risk: "At-Risk",
  inactive: "Inactive",
};

export function ReliabilityBadge({ band }: { band: ReliabilityBand }) {
  return (
    <Badge variant="outline" className={`${BAND_BADGE[band]} text-xs capitalize`}>
      {BAND_LABEL[band]}
    </Badge>
  );
}

/* ─── Supplier Performance Report (main) ────────────────────── */
export function SupplierPerformanceReport({ dealerId }: Props) {
  const { canExportReports } = usePermissions();
  const [search, setSearch] = useState("");
  const [band, setBand] = useState<ReliabilityBand | "all">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["supplier-performance", dealerId],
    queryFn: () => supplierPerformanceService.list(dealerId),
    enabled: !!dealerId,
  });

  const rows = useMemo(() => {
    const all = data ?? [];
    return all.filter((r) => {
      if (band !== "all" && r.reliability_band !== band) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!r.supplier_name.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [data, band, search]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4" /> Supplier Performance
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supplier…"
              className="h-9 w-44 pl-7"
            />
          </div>
          <Select value={band} onValueChange={(v) => setBand(v as ReliabilityBand | "all")}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All bands</SelectItem>
              <SelectItem value="reliable">Reliable</SelectItem>
              <SelectItem value="average">Average</SelectItem>
              <SelectItem value="at_risk">At-Risk</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {canExportReports && rows.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportToExcel(
                  rows.map((r) => ({
                    supplier: r.supplier_name,
                    band: BAND_LABEL[r.reliability_band],
                    score: r.reliability_score,
                    purchases: r.total_purchases,
                    purchase_value: r.total_purchase_value,
                    avg_value: r.avg_purchase_value,
                    last_purchase: r.last_purchase_date ?? "—",
                    days_since: r.days_since_last_purchase ?? "—",
                    avg_gap: r.avg_days_between_purchases ?? "—",
                    returns: r.total_returns,
                    return_value: r.total_return_value,
                    return_rate: r.return_rate_pct,
                    outstanding: r.outstanding_amount,
                  })),
                  [
                    { header: "Supplier", key: "supplier" },
                    { header: "Band", key: "band" },
                    { header: "Score", key: "score", format: "number" },
                    { header: "Purchases", key: "purchases", format: "number" },
                    { header: "Total Value", key: "purchase_value", format: "currency" },
                    { header: "Avg Value", key: "avg_value", format: "currency" },
                    { header: "Last Purchase", key: "last_purchase" },
                    { header: "Days Since", key: "days_since" },
                    { header: "Avg Gap (days)", key: "avg_gap" },
                    { header: "Returns", key: "returns", format: "number" },
                    { header: "Return Value", key: "return_value", format: "currency" },
                    { header: "Return Rate %", key: "return_rate", format: "number" },
                    { header: "Outstanding", key: "outstanding", format: "currency" },
                  ],
                  "supplier-performance",
                )
              }
            >
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No suppliers match these filters.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Band</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Purchases</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead className="text-right">Return %</TableHead>
                  <TableHead className="text-right">Avg Gap</TableHead>
                  <TableHead className="text-right">Last Purchase</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.supplier_id}>
                    <TableCell className="font-medium">{r.supplier_name}</TableCell>
                    <TableCell><ReliabilityBadge band={r.reliability_band} /></TableCell>
                    <TableCell className="text-right font-semibold">{r.reliability_score}</TableCell>
                    <TableCell className="text-right">{r.total_purchases}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.total_purchase_value)}</TableCell>
                    <TableCell className={`text-right ${r.return_rate_pct > 5 ? "text-destructive font-semibold" : ""}`}>
                      {r.return_rate_pct.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {r.avg_days_between_purchases !== null ? `${r.avg_days_between_purchases}d` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.last_purchase_date ?? "—"}
                      {r.days_since_last_purchase !== null && (
                        <span className="block text-xs">{r.days_since_last_purchase}d ago</span>
                      )}
                    </TableCell>
                    <TableCell className={`text-right ${r.outstanding_amount > 0 ? "text-amber-700 font-medium" : ""}`}>
                      {formatCurrency(r.outstanding_amount)}
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

/* ─── Top Reliable Suppliers ─────────────────────────────────── */
export function TopReliableSuppliersReport({ dealerId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["supplier-performance", dealerId],
    queryFn: () => supplierPerformanceService.list(dealerId),
    enabled: !!dealerId,
  });

  const rows = (data ?? [])
    .filter((s) => s.reliability_band === "reliable")
    .sort((a, b) => b.reliability_score - a.reliability_score || b.total_purchase_value - a.total_purchase_value)
    .slice(0, 20);

  return (
    <SimpleSupplierTable
      title="Top Reliable Suppliers"
      icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
      isLoading={isLoading}
      rows={rows}
      emptyText="No reliable suppliers yet — this builds up as you log purchases."
    />
  );
}

/* ─── At-Risk Suppliers ──────────────────────────────────────── */
export function AtRiskSuppliersReport({ dealerId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["supplier-performance", dealerId],
    queryFn: () => supplierPerformanceService.list(dealerId),
    enabled: !!dealerId,
  });

  const rows = (data ?? [])
    .filter((s) => s.reliability_band === "at_risk")
    .sort((a, b) => a.reliability_score - b.reliability_score);

  return (
    <SimpleSupplierTable
      title="At-Risk Suppliers"
      icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
      isLoading={isLoading}
      rows={rows}
      emptyText="No at-risk suppliers detected."
    />
  );
}

/* ─── Supplier Outstanding Exposure ──────────────────────────── */
export function SupplierExposureReport({ dealerId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["supplier-performance", dealerId],
    queryFn: () => supplierPerformanceService.list(dealerId),
    enabled: !!dealerId,
  });

  const rows = (data ?? [])
    .filter((s) => s.outstanding_amount > 0)
    .sort((a, b) => b.outstanding_amount - a.outstanding_amount);

  return (
    <SimpleSupplierTable
      title="Supplier Outstanding Exposure"
      icon={<Wallet className="h-4 w-4 text-amber-600" />}
      isLoading={isLoading}
      rows={rows}
      emptyText="No outstanding payables."
      emphasizeOutstanding
    />
  );
}

/* ─── Supplier Lead Time / Cadence ───────────────────────────── */
export function SupplierLeadTimeReport({ dealerId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["supplier-performance", dealerId],
    queryFn: () => supplierPerformanceService.list(dealerId),
    enabled: !!dealerId,
  });

  const rows = (data ?? [])
    .filter((s) => s.avg_days_between_purchases !== null)
    .sort((a, b) => (a.avg_days_between_purchases ?? 0) - (b.avg_days_between_purchases ?? 0));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Supplier Supply Cadence
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Average days between consecutive purchases — a practical proxy for supplier responsiveness.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Need at least 2 purchases per supplier to compute cadence.
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Purchases</TableHead>
                  <TableHead className="text-right">Avg Gap (days)</TableHead>
                  <TableHead className="text-right">Last Purchase</TableHead>
                  <TableHead className="text-right">Days Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.supplier_id}>
                    <TableCell className="font-medium">{r.supplier_name}</TableCell>
                    <TableCell className="text-right">{r.total_purchases}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.avg_days_between_purchases}d
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.last_purchase_date ?? "—"}
                    </TableCell>
                    <TableCell className={`text-right ${(r.days_since_last_purchase ?? 0) > 90 ? "text-destructive font-medium" : ""}`}>
                      {r.days_since_last_purchase !== null ? `${r.days_since_last_purchase}d` : "—"}
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

/* ─── Supplier Return / Damage ───────────────────────────────── */
export function SupplierReturnReport({ dealerId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["supplier-performance", dealerId],
    queryFn: () => supplierPerformanceService.list(dealerId),
    enabled: !!dealerId,
  });

  const rows = (data ?? [])
    .filter((s) => s.total_returns > 0)
    .sort((a, b) => b.return_rate_pct - a.return_rate_pct);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" /> Supplier Return / Damage
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No purchase returns recorded — clean run.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Returns</TableHead>
                  <TableHead className="text-right">Return Value</TableHead>
                  <TableHead className="text-right">Return Rate %</TableHead>
                  <TableHead className="text-right">Total Purchases</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.supplier_id}>
                    <TableCell className="font-medium">{r.supplier_name}</TableCell>
                    <TableCell className="text-right">{r.total_returns}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.total_return_value)}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.return_rate_pct > 5 ? "text-destructive" : ""}`}>
                      {r.return_rate_pct.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(r.total_purchase_value)}
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

/* ─── Shared compact supplier table ──────────────────────────── */
function SimpleSupplierTable({
  title,
  icon,
  rows,
  isLoading,
  emptyText,
  emphasizeOutstanding,
}: {
  title: string;
  icon: React.ReactNode;
  rows: SupplierPerformance[];
  isLoading: boolean;
  emptyText: string;
  emphasizeOutstanding?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{emptyText}</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Band</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Purchases</TableHead>
                  <TableHead className="text-right">Return %</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.supplier_id}>
                    <TableCell className="font-medium">{r.supplier_name}</TableCell>
                    <TableCell><ReliabilityBadge band={r.reliability_band} /></TableCell>
                    <TableCell className="text-right">{r.reliability_score}</TableCell>
                    <TableCell className="text-right">{r.total_purchases}</TableCell>
                    <TableCell className="text-right">{r.return_rate_pct.toFixed(2)}%</TableCell>
                    <TableCell className={`text-right ${emphasizeOutstanding && r.outstanding_amount > 0 ? "text-amber-700 font-semibold" : ""}`}>
                      {formatCurrency(r.outstanding_amount)}
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
