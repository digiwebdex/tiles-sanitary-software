import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { exportToExcel } from "@/lib/exportUtils";
import {
  demandPlanningService,
  DEMAND_THRESHOLDS,
  type DemandRow,
  type DemandFlag,
} from "@/services/demandPlanningService";
import { formatCurrency } from "@/lib/utils";

interface Props { dealerId: string }

const FLAG_LABELS: Record<DemandFlag, string> = {
  stockout_risk: "Stockout Risk",
  low_stock: "Low Stock",
  reorder_suggested: "Reorder",
  fast_moving: "Fast Moving",
  slow_moving: "Slow Moving",
  dead_stock: "Dead Stock",
  ok: "OK",
};

const FLAG_VARIANT: Record<DemandFlag, "default" | "destructive" | "secondary" | "outline"> = {
  stockout_risk: "destructive",
  low_stock: "destructive",
  reorder_suggested: "default",
  fast_moving: "secondary",
  slow_moving: "outline",
  dead_stock: "destructive",
  ok: "outline",
};

function useDemandRows(dealerId: string) {
  return useQuery({
    queryKey: ["demand-planning-rows", dealerId],
    queryFn: () => demandPlanningService.getDemandRows(dealerId),
    enabled: !!dealerId,
    staleTime: 60_000,
  });
}

function useFiltered(rows: DemandRow[] | undefined, flag: DemandFlag, search: string) {
  return useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => r.flags.includes(flag))
      .filter((r) =>
        !q ||
        r.sku.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.brand ?? "").toLowerCase().includes(q),
      );
  }, [rows, flag, search]);
}

interface Column {
  header: string;
  key?: keyof DemandRow;
  render?: (r: DemandRow) => React.ReactNode;
}

function ReportShell({
  title, subtitle, rows, exportName, columns,
}: {
  title: string;
  subtitle: string;
  rows: DemandRow[];
  exportName: string;
  columns: Column[];
}) {
  const handleExport = () => {
    exportToExcel(
      rows.map((r) => ({
        SKU: r.sku, Product: r.name, Brand: r.brand ?? "—",
        Category: r.category, Free: r.free_stock, Total: r.total_stock,
        Reserved: r.reserved_stock, Reorder_Level: r.reorder_level,
        Sold_30d: r.sold_30d, Sold_90d: r.sold_90d,
        Velocity_PerDay: r.velocity_per_day,
        Days_Of_Cover: r.days_of_cover ?? "∞",
        Open_Shortage: r.open_shortage,
        Incoming_30d: r.incoming_30d,
        Suggested_Reorder: r.suggested_reorder_qty,
        Last_Sale: r.last_sale_date ?? "—",
        Days_Since_Sale: r.days_since_last_sale ?? "—",
        Flag: r.primary_flag,
      })),
      exportName,
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={!rows.length}>
          Export
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => <TableHead key={c.header}>{c.header}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                    No products match this report.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.product_id}>
                  {columns.map((c) => (
                    <TableCell key={c.header}>
                      {c.render
                        ? c.render(r)
                        : c.key
                          ? String(r[c.key] ?? "—")
                          : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      placeholder="Search SKU, product, brand…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-sm mb-3"
    />
  );
}

const COMMON_COLS = (extra: Column[] = []): Column[] => [
  { header: "SKU", render: (r: DemandRow) => <span className="font-mono text-xs">{r.sku}</span> },
  { header: "Product", render: (r: DemandRow) => (
    <div>
      <div className="font-medium">{r.name}</div>
      <div className="text-xs text-muted-foreground">{r.brand ?? "—"} · {r.category}</div>
    </div>
  ) },
  { header: "Free", render: (r) => r.free_stock },
  { header: "Reserved", render: (r) => r.reserved_stock },
  ...extra,
];

// ─── Reorder Suggestion Report ────────────────────────────────────
export function ReorderSuggestionReport({ dealerId }: Props) {
  const [search, setSearch] = useState("");
  const { data: rows } = useDemandRows(dealerId);
  const filtered = useFiltered(rows, "reorder_suggested", search);

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} />
      <ReportShell
        title="Reorder Suggestion"
        subtitle={`Free stock at or below reorder level, or covering less than ${DEMAND_THRESHOLDS.REORDER_COVER_DAYS} days of demand. Target cover: ${DEMAND_THRESHOLDS.TARGET_COVER_DAYS} days.`}
        rows={filtered}
        exportName="reorder-suggestion"
        columns={COMMON_COLS([
          { header: "Reorder Lvl", render: (r) => r.reorder_level },
          { header: "Velocity/day", render: (r) => r.velocity_per_day.toFixed(2) },
          { header: "Days Cover", render: (r) => r.days_of_cover === null ? "∞" : r.days_of_cover },
          { header: "Open Shortage", render: (r) => r.open_shortage || "—" },
          { header: "Incoming 30d", render: (r) => r.incoming_30d || "—" },
          { header: "Suggested Qty", render: (r) => <span className="font-semibold">{r.suggested_reorder_qty}</span> },
        ])}
      />
    </div>
  );
}

// ─── Low Stock / Stockout Risk Report ──────────────────────────────
export function StockoutRiskReport({ dealerId }: Props) {
  const [search, setSearch] = useState("");
  const { data: rows } = useDemandRows(dealerId);
  const filtered = useMemo(() => {
    const all = (rows ?? []).filter((r) =>
      r.flags.includes("stockout_risk") || r.flags.includes("low_stock"),
    );
    const q = search.trim().toLowerCase();
    return q
      ? all.filter((r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      : all;
  }, [rows, search]);

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} />
      <ReportShell
        title="Low Stock / Stockout Risk"
        subtitle={`Low stock = free ≤ reorder level. Stockout risk = free is zero or covers less than ${DEMAND_THRESHOLDS.STOCKOUT_COVER_DAYS} days.`}
        rows={filtered}
        exportName="stockout-risk"
        columns={COMMON_COLS([
          { header: "Reorder Lvl", render: (r) => r.reorder_level },
          { header: "Days Cover", render: (r) => r.days_of_cover === null ? "∞" : r.days_of_cover },
          { header: "Status", render: (r) => (
            <Badge variant={FLAG_VARIANT[r.primary_flag]}>{FLAG_LABELS[r.primary_flag]}</Badge>
          ) },
          { header: "Suggested Qty", render: (r) => r.suggested_reorder_qty },
        ])}
      />
    </div>
  );
}

// ─── Dead Stock Report ─────────────────────────────────────────────
export function DeadStockReport({ dealerId }: Props) {
  const [search, setSearch] = useState("");
  const { data: rows } = useDemandRows(dealerId);
  const filtered = useFiltered(rows, "dead_stock", search);

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} />
      <ReportShell
        title="Dead Stock"
        subtitle={`No sales in the last ${DEMAND_THRESHOLDS.DEAD_STOCK_DAYS} days while stock is on hand.`}
        rows={filtered}
        exportName="dead-stock"
        columns={COMMON_COLS([
          { header: "Total Stock", render: (r) => r.total_stock },
          { header: "Last Sale", render: (r) => r.last_sale_date?.slice(0, 10) ?? "Never" },
          { header: "Days Idle", render: (r) => r.days_since_last_sale ?? "∞" },
        ])}
      />
    </div>
  );
}

// ─── Slow Moving Report ────────────────────────────────────────────
export function SlowMovingReport({ dealerId }: Props) {
  const [search, setSearch] = useState("");
  const { data: rows } = useDemandRows(dealerId);
  const filtered = useFiltered(rows, "slow_moving", search);

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} />
      <ReportShell
        title="Slow Moving Stock"
        subtitle={`Sold something in the last 90 days but fewer than ${DEMAND_THRESHOLDS.SLOW_MOVING_30D_MAX} units in the last 30 days.`}
        rows={filtered}
        exportName="slow-moving"
        columns={COMMON_COLS([
          { header: "Sold 30d", render: (r) => r.sold_30d },
          { header: "Sold 90d", render: (r) => r.sold_90d },
          { header: "Total Stock", render: (r) => r.total_stock },
        ])}
      />
    </div>
  );
}

// ─── Fast Moving Report ────────────────────────────────────────────
export function FastMovingReport({ dealerId }: Props) {
  const [search, setSearch] = useState("");
  const { data: rows } = useDemandRows(dealerId);
  const filtered = useMemo(() => {
    const all = (rows ?? []).filter((r) => r.flags.includes("fast_moving"));
    all.sort((a, b) => b.sold_30d - a.sold_30d);
    const q = search.trim().toLowerCase();
    return q
      ? all.filter((r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      : all;
  }, [rows, search]);

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} />
      <ReportShell
        title="Fast Moving Products"
        subtitle={`Sold ${DEMAND_THRESHOLDS.FAST_MOVING_30D_QTY} or more units in the last 30 days. Sorted by velocity.`}
        rows={filtered}
        exportName="fast-moving"
        columns={COMMON_COLS([
          { header: "Sold 30d", render: (r) => <span className="font-semibold">{r.sold_30d}</span> },
          { header: "Velocity/day", render: (r) => r.velocity_per_day.toFixed(2) },
          { header: "Days Cover", render: (r) => r.days_of_cover === null ? "∞" : r.days_of_cover },
        ])}
      />
    </div>
  );
}

// ─── Incoming vs Demand Coverage Report ────────────────────────────
export function IncomingCoverageReport({ dealerId }: Props) {
  const [search, setSearch] = useState("");
  const { data: rows } = useDemandRows(dealerId);
  const filtered = useMemo(() => {
    const all = (rows ?? []).filter((r) => r.incoming_30d > 0 || r.open_shortage > 0);
    all.sort((a, b) => b.open_shortage - a.open_shortage);
    const q = search.trim().toLowerCase();
    return q
      ? all.filter((r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      : all;
  }, [rows, search]);

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} />
      <ReportShell
        title="Incoming vs Demand Coverage"
        subtitle="Recent inflow (last 30 days) compared to current open shortages and free stock. Advisory only."
        rows={filtered}
        exportName="incoming-coverage"
        columns={COMMON_COLS([
          { header: "Open Shortage", render: (r) => r.open_shortage || "—" },
          { header: "Incoming 30d", render: (r) => r.incoming_30d || "—" },
          { header: "Coverage", render: (r) => {
            const need = r.open_shortage + Math.max(0, r.reorder_level - r.free_stock);
            if (need <= 0) return <Badge variant="outline">No need</Badge>;
            const ratio = r.incoming_30d / need;
            if (ratio >= 1) return <Badge variant="secondary">Covered</Badge>;
            if (ratio > 0) return <Badge variant="default">Partial ({Math.round(ratio * 100)}%)</Badge>;
            return <Badge variant="destructive">Uncovered</Badge>;
          } },
          { header: "Days Cover", render: (r) => r.days_of_cover === null ? "∞" : r.days_of_cover },
        ])}
      />
    </div>
  );
}

// Combined export for convenience (also re-export labels for badge use elsewhere)
export { FLAG_LABELS, FLAG_VARIANT };
