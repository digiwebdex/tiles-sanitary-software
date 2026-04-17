import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { exportToExcel } from "@/lib/exportUtils";
import {
  demandPlanningService,
  type DemandRow,
  type DemandFlag,
  type DemandGroupRow,
} from "@/services/demandPlanningService";
import { demandPlanningSettingsService } from "@/services/demandPlanningSettingsService";

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

function useSettings(dealerId: string) {
  return useQuery({
    queryKey: ["demand-planning-settings", dealerId],
    queryFn: () => demandPlanningSettingsService.get(dealerId),
    enabled: !!dealerId,
    staleTime: 60_000,
  });
}

function applyFilters(
  rows: DemandRow[],
  search: string,
  brand: string,
  category: string,
) {
  const q = search.trim().toLowerCase();
  return rows.filter((r) => {
    if (q) {
      const m =
        r.sku.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.brand ?? "").toLowerCase().includes(q) ||
        (r.size ?? "").toLowerCase().includes(q);
      if (!m) return false;
    }
    if (brand !== "all" && (r.brand ?? "—") !== brand) return false;
    if (category !== "all" && r.category !== category) return false;
    return true;
  });
}

interface Column {
  header: string;
  render: (r: DemandRow) => React.ReactNode;
}

function FilterBar({
  search, onSearch, brand, onBrand, category, onCategory, brands, categories,
}: {
  search: string; onSearch: (v: string) => void;
  brand: string; onBrand: (v: string) => void;
  category: string; onCategory: (v: string) => void;
  brands: string[]; categories: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <Input
        placeholder="Search SKU, product, brand, size…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className="max-w-xs"
      />
      <Select value={category} onValueChange={onCategory}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={brand} onValueChange={onBrand}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Brand" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All brands</SelectItem>
          {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
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
    const def = [
      { key: "SKU", header: "SKU" },
      { key: "Product", header: "Product" },
      { key: "Brand", header: "Brand" },
      { key: "Category", header: "Category" },
      { key: "Size", header: "Size" },
      { key: "Free", header: "Free", format: "number" as const },
      { key: "Total", header: "Total", format: "number" as const },
      { key: "Reserved", header: "Reserved", format: "number" as const },
      { key: "Safety", header: "Safety Stock", format: "number" as const },
      { key: "Reorder_Level", header: "Reorder Level", format: "number" as const },
      { key: "Sold_30d", header: "Sold 30d", format: "number" as const },
      { key: "Sold_90d", header: "Sold 90d", format: "number" as const },
      { key: "Velocity_PerDay", header: "Velocity / day", format: "number" as const },
      { key: "Days_Of_Cover", header: "Days Cover" },
      { key: "Open_Shortage", header: "Open Shortage", format: "number" as const },
      { key: "Incoming", header: "Incoming", format: "number" as const },
      { key: "Coverage", header: "Coverage" },
      { key: "Uncovered_Gap", header: "Uncovered Gap", format: "number" as const },
      { key: "Suggested_Reorder", header: "Suggested Qty", format: "number" as const },
      { key: "Last_Sale", header: "Last Sale" },
      { key: "Days_Since_Sale", header: "Days Since Sale" },
      { key: "Flag", header: "Flag" },
    ];
    exportToExcel(
      rows.map((r) => ({
        SKU: r.sku, Product: r.name, Brand: r.brand ?? "—",
        Category: r.category, Size: r.size ?? "—",
        Free: r.free_stock, Total: r.total_stock, Reserved: r.reserved_stock,
        Safety: r.safety_stock, Reorder_Level: r.reorder_level,
        Sold_30d: r.sold_30d, Sold_90d: r.sold_90d,
        Velocity_PerDay: r.velocity_per_day,
        Days_Of_Cover: r.days_of_cover ?? "∞",
        Open_Shortage: r.open_shortage,
        Incoming: r.incoming_qty,
        Coverage: r.coverage_status,
        Uncovered_Gap: r.uncovered_gap,
        Suggested_Reorder: r.suggested_reorder_qty,
        Last_Sale: r.last_sale_date ?? "—",
        Days_Since_Sale: r.days_since_last_sale ?? "—",
        Flag: r.primary_flag,
      })),
      def,
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
                    <TableCell key={c.header}>{c.render(r)}</TableCell>
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

const COMMON_COLS = (extra: Column[] = []): Column[] => [
  { header: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
  { header: "Product", render: (r) => (
    <div>
      <div className="font-medium">{r.name}</div>
      <div className="text-xs text-muted-foreground">
        {r.brand ?? "—"} · {r.category}{r.size ? ` · ${r.size}` : ""}
      </div>
    </div>
  ) },
  { header: "Free", render: (r) => r.free_stock },
  { header: "Reserved", render: (r) => r.reserved_stock },
  ...extra,
];

function useDistinct(rows: DemandRow[] | undefined) {
  return useMemo(() => {
    const brands = new Set<string>();
    const categories = new Set<string>();
    for (const r of rows ?? []) {
      brands.add((r.brand ?? "—").trim() || "—");
      categories.add(r.category);
    }
    return {
      brands: Array.from(brands).sort(),
      categories: Array.from(categories).sort(),
    };
  }, [rows]);
}

function useReportState() {
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("all");
  const [category, setCategory] = useState("all");
  return { search, setSearch, brand, setBrand, category, setCategory };
}

// ─── Reorder Suggestion Report ────────────────────────────────────
export function ReorderSuggestionReport({ dealerId }: Props) {
  const st = useReportState();
  const { data: rows } = useDemandRows(dealerId);
  const { data: settings } = useSettings(dealerId);
  const { brands, categories } = useDistinct(rows);
  const filtered = useMemo(() => {
    const base = (rows ?? []).filter((r) => r.flags.includes("reorder_suggested"));
    return applyFilters(base, st.search, st.brand, st.category)
      .sort((a, b) => b.suggested_reorder_qty - a.suggested_reorder_qty);
  }, [rows, st.search, st.brand, st.category]);

  return (
    <div>
      <FilterBar {...st} onSearch={st.setSearch} onBrand={st.setBrand} onCategory={st.setCategory}
        brands={brands} categories={categories} />
      <ReportShell
        title="Reorder Suggestion"
        subtitle={`Free at/below reorder + safety, or covering less than ${settings?.reorder_cover_days ?? 14} days. Target cover: ${settings?.target_cover_days ?? 30} days.`}
        rows={filtered}
        exportName="reorder-suggestion"
        columns={COMMON_COLS([
          { header: "Reorder Lvl", render: (r) => r.reorder_level },
          { header: "Velocity/day", render: (r) => r.velocity_per_day.toFixed(2) },
          { header: "Days Cover", render: (r) => r.days_of_cover === null ? "∞" : r.days_of_cover },
          { header: "Open Shortage", render: (r) => r.open_shortage || "—" },
          { header: "Incoming", render: (r) => r.incoming_qty || "—" },
          { header: "Suggested Qty", render: (r) => <span className="font-semibold">{r.suggested_reorder_qty}</span> },
        ])}
      />
    </div>
  );
}

// ─── Low Stock / Stockout Risk Report ──────────────────────────────
export function StockoutRiskReport({ dealerId }: Props) {
  const st = useReportState();
  const { data: rows } = useDemandRows(dealerId);
  const { data: settings } = useSettings(dealerId);
  const { brands, categories } = useDistinct(rows);
  const filtered = useMemo(() => {
    const base = (rows ?? []).filter((r) =>
      r.flags.includes("stockout_risk") || r.flags.includes("low_stock"),
    );
    return applyFilters(base, st.search, st.brand, st.category)
      .sort((a, b) => (a.days_of_cover ?? 9999) - (b.days_of_cover ?? 9999));
  }, [rows, st.search, st.brand, st.category]);

  return (
    <div>
      <FilterBar {...st} onSearch={st.setSearch} onBrand={st.setBrand} onCategory={st.setCategory}
        brands={brands} categories={categories} />
      <ReportShell
        title="Low Stock / Stockout Risk"
        subtitle={`Low stock = free ≤ reorder + safety. Stockout risk = free hits safety or covers less than ${settings?.stockout_cover_days ?? 7} days.`}
        rows={filtered}
        exportName="stockout-risk"
        columns={COMMON_COLS([
          { header: "Reorder Lvl", render: (r) => r.reorder_level },
          { header: "Safety", render: (r) => r.safety_stock || "—" },
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
  const st = useReportState();
  const { data: rows } = useDemandRows(dealerId);
  const { data: settings } = useSettings(dealerId);
  const { brands, categories } = useDistinct(rows);
  const filtered = useMemo(() => {
    const base = (rows ?? []).filter((r) => r.flags.includes("dead_stock"));
    return applyFilters(base, st.search, st.brand, st.category)
      .sort((a, b) => (b.days_since_last_sale ?? 0) - (a.days_since_last_sale ?? 0));
  }, [rows, st.search, st.brand, st.category]);

  return (
    <div>
      <FilterBar {...st} onSearch={st.setSearch} onBrand={st.setBrand} onCategory={st.setCategory}
        brands={brands} categories={categories} />
      <ReportShell
        title="Dead Stock"
        subtitle={`No sales in the last ${settings?.dead_stock_days ?? 90} days while stock is on hand.`}
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
  const st = useReportState();
  const { data: rows } = useDemandRows(dealerId);
  const { data: settings } = useSettings(dealerId);
  const { brands, categories } = useDistinct(rows);
  const filtered = useMemo(() => {
    const base = (rows ?? []).filter((r) => r.flags.includes("slow_moving"));
    return applyFilters(base, st.search, st.brand, st.category);
  }, [rows, st.search, st.brand, st.category]);

  return (
    <div>
      <FilterBar {...st} onSearch={st.setSearch} onBrand={st.setBrand} onCategory={st.setCategory}
        brands={brands} categories={categories} />
      <ReportShell
        title="Slow Moving Stock"
        subtitle={`Sold something in the last 90 days but fewer than ${settings?.slow_moving_30d_max ?? 5} units in the last 30 days.`}
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
  const st = useReportState();
  const { data: rows } = useDemandRows(dealerId);
  const { data: settings } = useSettings(dealerId);
  const { brands, categories } = useDistinct(rows);
  const filtered = useMemo(() => {
    const base = (rows ?? []).filter((r) => r.flags.includes("fast_moving"));
    return applyFilters(base, st.search, st.brand, st.category)
      .sort((a, b) => b.sold_30d - a.sold_30d);
  }, [rows, st.search, st.brand, st.category]);

  return (
    <div>
      <FilterBar {...st} onSearch={st.setSearch} onBrand={st.setBrand} onCategory={st.setCategory}
        brands={brands} categories={categories} />
      <ReportShell
        title="Fast Moving Products"
        subtitle={`Sold ${settings?.fast_moving_30d_qty ?? 20} or more units in the last 30 days. Sorted by velocity.`}
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
const COVERAGE_LABEL: Record<DemandRow["coverage_status"], string> = {
  no_need: "No Need",
  uncovered: "Uncovered",
  partial: "Partial",
  covered: "Covered",
};
const COVERAGE_VARIANT: Record<DemandRow["coverage_status"], "default" | "destructive" | "secondary" | "outline"> = {
  no_need: "outline",
  uncovered: "destructive",
  partial: "default",
  covered: "secondary",
};

export function IncomingCoverageReport({ dealerId }: Props) {
  const st = useReportState();
  const [coverage, setCoverage] = useState<DemandRow["coverage_status"] | "all">("all");
  const { data: rows } = useDemandRows(dealerId);
  const { data: settings } = useSettings(dealerId);
  const { brands, categories } = useDistinct(rows);

  const filtered = useMemo(() => {
    const base = (rows ?? []).filter((r) =>
      r.incoming_qty > 0 || r.open_shortage > 0 || r.uncovered_gap > 0,
    );
    const f1 = applyFilters(base, st.search, st.brand, st.category);
    const f2 = coverage === "all" ? f1 : f1.filter((r) => r.coverage_status === coverage);
    return f2.sort((a, b) => b.uncovered_gap - a.uncovered_gap);
  }, [rows, st.search, st.brand, st.category, coverage]);

  return (
    <div>
      <FilterBar {...st} onSearch={st.setSearch} onBrand={st.setBrand} onCategory={st.setCategory}
        brands={brands} categories={categories} />
      <div className="mb-3">
        <Select value={coverage} onValueChange={(v) => setCoverage(v as typeof coverage)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Coverage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All coverage</SelectItem>
            <SelectItem value="uncovered">Uncovered</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="covered">Covered</SelectItem>
            <SelectItem value="no_need">No need</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ReportShell
        title="Incoming vs Demand Coverage"
        subtitle={`Incoming inflow (last ${settings?.incoming_window_days ?? 30}d) vs current free stock, open shortages and reorder + safety needs. Advisory only.`}
        rows={filtered}
        exportName="incoming-coverage"
        columns={COMMON_COLS([
          { header: "Open Shortage", render: (r) => r.open_shortage || "—" },
          { header: "Incoming", render: (r) => r.incoming_qty || "—" },
          { header: "Uncovered Gap", render: (r) => r.uncovered_gap || "—" },
          { header: "Coverage", render: (r) => (
            <Badge variant={COVERAGE_VARIANT[r.coverage_status]}>
              {COVERAGE_LABEL[r.coverage_status]}
              {r.coverage_status === "partial" && r.coverage_ratio !== null
                ? ` (${Math.round(r.coverage_ratio * 100)}%)`
                : ""}
            </Badge>
          ) },
          { header: "Days Cover", render: (r) => r.days_of_cover === null ? "∞" : r.days_of_cover },
        ])}
      />
    </div>
  );
}

// ─── Demand by Category / Brand / Size grouping report ─────────────
function GroupTable({ rows, label }: { rows: DemandGroupRow[]; label: string }) {
  const handleExport = () => {
    exportToExcel(
      rows.map((g) => ({
        Group: g.key, Products: g.product_count,
        Reorder: g.reorder_count, Stockout: g.stockout_count,
        Low: g.low_stock_count, Dead: g.dead_count,
        Fast: g.fast_count, Slow: g.slow_count,
        Free_Stock: g.free_stock_total, Incoming: g.incoming_total,
        Open_Shortage: g.open_shortage_total, Uncovered_Gap: g.uncovered_gap_total,
      })),
      [
        { key: "Group", header: label },
        { key: "Products", header: "Products", format: "number" },
        { key: "Reorder", header: "Reorder", format: "number" },
        { key: "Stockout", header: "Stockout", format: "number" },
        { key: "Low", header: "Low", format: "number" },
        { key: "Dead", header: "Dead", format: "number" },
        { key: "Fast", header: "Fast", format: "number" },
        { key: "Slow", header: "Slow", format: "number" },
        { key: "Free_Stock", header: "Free Stock", format: "number" },
        { key: "Incoming", header: "Incoming", format: "number" },
        { key: "Open_Shortage", header: "Open Shortage", format: "number" },
        { key: "Uncovered_Gap", header: "Uncovered Gap", format: "number" },
      ],
      `demand-by-${label.toLowerCase()}`,
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={handleExport} disabled={!rows.length}>
          Export
        </Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{label}</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead className="text-right">Reorder</TableHead>
              <TableHead className="text-right">Stockout</TableHead>
              <TableHead className="text-right">Low</TableHead>
              <TableHead className="text-right">Dead</TableHead>
              <TableHead className="text-right">Fast</TableHead>
              <TableHead className="text-right">Slow</TableHead>
              <TableHead className="text-right">Free Stock</TableHead>
              <TableHead className="text-right">Incoming</TableHead>
              <TableHead className="text-right">Open Shortage</TableHead>
              <TableHead className="text-right">Uncovered Gap</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                  No data.
                </TableCell>
              </TableRow>
            )}
            {rows.map((g) => (
              <TableRow key={g.key}>
                <TableCell className="font-medium">{g.key}</TableCell>
                <TableCell className="text-right">{g.product_count}</TableCell>
                <TableCell className="text-right">{g.reorder_count || "—"}</TableCell>
                <TableCell className="text-right">
                  {g.stockout_count
                    ? <span className="font-semibold text-destructive">{g.stockout_count}</span>
                    : "—"}
                </TableCell>
                <TableCell className="text-right">{g.low_stock_count || "—"}</TableCell>
                <TableCell className="text-right">{g.dead_count || "—"}</TableCell>
                <TableCell className="text-right">{g.fast_count || "—"}</TableCell>
                <TableCell className="text-right">{g.slow_count || "—"}</TableCell>
                <TableCell className="text-right">{g.free_stock_total}</TableCell>
                <TableCell className="text-right">{g.incoming_total || "—"}</TableCell>
                <TableCell className="text-right">{g.open_shortage_total || "—"}</TableCell>
                <TableCell className="text-right">
                  {g.uncovered_gap_total
                    ? <span className="font-semibold text-destructive">{g.uncovered_gap_total}</span>
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function DemandByGroupReport({ dealerId }: Props) {
  const [grouping, setGrouping] = useState<"category" | "brand" | "size">("category");
  const { data: rows } = useDemandRows(dealerId);

  const groups = useMemo(() => {
    if (!rows) return [];
    if (grouping === "category") return demandPlanningService.groupByCategory(rows);
    if (grouping === "brand") return demandPlanningService.groupByBrand(rows);
    return demandPlanningService.groupBySize(rows);
  }, [rows, grouping]);

  const label = grouping === "category" ? "Category" : grouping === "brand" ? "Brand" : "Size";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Demand by {label}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Roll-up of all demand signals across the catalogue. Sorted by total risk count.
          </p>
        </div>
        <Select value={grouping} onValueChange={(v) => setGrouping(v as typeof grouping)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="category">Category</SelectItem>
            <SelectItem value="brand">Brand</SelectItem>
            <SelectItem value="size">Size</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <GroupTable rows={groups} label={label} />
      </CardContent>
    </Card>
  );
}

export { FLAG_LABELS, FLAG_VARIANT };
