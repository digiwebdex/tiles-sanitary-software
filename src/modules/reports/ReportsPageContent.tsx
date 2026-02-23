import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import Pagination from "@/components/Pagination";
import {
  fetchStockReport,
  fetchBrandStockReport,
  fetchSalesReport,
  fetchRetailerSalesReport,
  fetchProductHistory,
  fetchAccountingSummary,
  fetchInventoryAgingReport,
  fetchLowStockReport,
  type InventoryAgingRow,
  REPORT_PAGE_SIZE,
} from "@/services/reportService";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  BarChart3, Package, Layers, Tags, AlertTriangle,
  Receipt, CalendarDays, Calendar, CreditCard,
  ShoppingCart, DollarSign, Users, History, BookOpen,
} from "lucide-react";

interface ReportsPageContentProps {
  dealerId: string;
}

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const reportNavItems = [
  { key: "stock", label: "Products Report", icon: Package },
  { key: "brand-stock", label: "Brands Report", icon: Tags },
  { key: "inventory", label: "Inventory Report", icon: Layers },
  { key: "low-stock", label: "Low Stock Report", icon: AlertTriangle },
  { key: "sales", label: "Sales Report", icon: Receipt },
  { key: "retailer", label: "Customers Report", icon: Users },
  { key: "purchases", label: "Purchases Report", icon: ShoppingCart },
  { key: "payments", label: "Payments Report", icon: CreditCard },
  { key: "product-history", label: "Product History", icon: History },
  { key: "accounting", label: "Expenses Report", icon: DollarSign },
];

const ReportsPageContent = ({ dealerId }: ReportsPageContentProps) => {
  const [activeReport, setActiveReport] = useState("stock");

  const renderReport = () => {
    switch (activeReport) {
      case "stock": return <StockReport dealerId={dealerId} />;
      case "brand-stock": return <BrandStockReport dealerId={dealerId} />;
      case "inventory": return <InventoryAgingReport dealerId={dealerId} />;
      case "low-stock": return <LowStockReport dealerId={dealerId} />;
      case "sales": return <SalesReport dealerId={dealerId} />;
      case "purchases": return <PurchasesReport dealerId={dealerId} />;
      case "payments": return <PaymentsReport dealerId={dealerId} />;
      case "retailer": return <RetailerSalesReport dealerId={dealerId} />;
      case "product-history": return <ProductHistoryReport dealerId={dealerId} />;
      case "accounting": return <AccountingSummaryReport dealerId={dealerId} />;
      default: return <StockReport dealerId={dealerId} />;
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r bg-card p-3 gap-0.5 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 mb-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Reports</h2>
        </div>
        <nav className="space-y-0.5">
          {reportNavItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveReport(item.key)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                activeReport === item.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile horizontal scroll nav */}
      <nav className="flex md:hidden overflow-x-auto border-b bg-card px-2 py-1 gap-1 absolute top-0 left-0 right-0 z-10">
        {reportNavItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveReport(item.key)}
            className={cn(
              "flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition-colors",
              activeReport === item.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            )}
          >
            <item.icon className="h-3 w-3" />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 lg:p-6 md:pt-4 pt-12">
        {renderReport()}
      </div>
    </div>
  );
};

// ─── Stock Report ─────────────────────────────────────────
function StockReport({ dealerId }: { dealerId: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["report-stock", dealerId, page, search],
    queryFn: () => fetchStockReport(dealerId, page, search),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-base">Stock Report (SKU-wise)</CardTitle>
        <Input
          placeholder="Search SKU, name, brand…"
          className="max-w-xs"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Box</TableHead>
                    <TableHead className="text-right">SFT</TableHead>
                    <TableHead className="text-right">Piece</TableHead>
                    <TableHead className="text-right">Avg Cost</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No products</TableCell></TableRow>
                  ) : (data?.rows ?? []).map((r) => (
                    <TableRow key={r.productId}>
                      <TableCell className="font-mono text-sm">{r.sku}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.brand || "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize text-xs">{r.category}</Badge></TableCell>
                      <TableCell className="text-right">{r.boxQty}</TableCell>
                      <TableCell className="text-right">{r.sftQty.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{r.pieceQty}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.avgCost)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(r.stockValue)}</TableCell>
                      <TableCell>
                        {r.isLow ? (
                          <Badge variant="destructive" className="text-xs">Low</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalItems={data?.total ?? 0} pageSize={REPORT_PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Brand-wise Stock ─────────────────────────────────────
function BrandStockReport({ dealerId }: { dealerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-brand-stock", dealerId],
    queryFn: () => fetchBrandStockReport(dealerId),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Brand-wise Stock</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead className="text-right">Boxes</TableHead>
                  <TableHead className="text-right">SFT</TableHead>
                  <TableHead className="text-right">Pieces</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                ) : (data ?? []).map((r) => (
                  <TableRow key={r.brand}>
                    <TableCell className="font-medium">{r.brand}</TableCell>
                    <TableCell className="text-right">{r.productCount}</TableCell>
                    <TableCell className="text-right">{r.totalBox}</TableCell>
                    <TableCell className="text-right">{r.totalSft.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.totalPiece}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(r.totalValue)}</TableCell>
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

// ─── Sales Report ─────────────────────────────────────────
function SalesReport({ dealerId }: { dealerId: string }) {
  const [mode, setMode] = useState<"daily" | "monthly">("monthly");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const { isDealerAdmin } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["report-sales", dealerId, mode, year, month],
    queryFn: () => fetchSalesReport(dealerId, mode, year, mode === "daily" ? month : undefined),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="text-base">Sales Report</CardTitle>
        <div className="flex gap-2 flex-wrap">
          <Select value={mode} onValueChange={(v) => setMode(v as any)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          {mode === "daily" && (
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{mode === "daily" ? "Date" : "Month"}</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {isDealerAdmin && <TableHead className="text-right">Profit</TableHead>}
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={isDealerAdmin ? 5 : 4} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                ) : (data ?? []).map((r) => (
                  <TableRow key={r.date}>
                    <TableCell className="font-medium">{r.date}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalAmount)}</TableCell>
                    {isDealerAdmin && (
                      <TableCell className={`text-right font-semibold ${r.totalProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                        {formatCurrency(r.totalProfit)}
                      </TableCell>
                    )}
                    <TableCell className={`text-right ${r.totalDue > 0 ? "text-destructive font-semibold" : ""}`}>
                      {formatCurrency(r.totalDue)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                {(data ?? []).length > 0 && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{(data ?? []).reduce((s, r) => s + r.count, 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalAmount, 0))}</TableCell>
                    {isDealerAdmin && (
                      <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalProfit, 0))}</TableCell>
                    )}
                    <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalDue, 0))}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Retailer-wise Sales ──────────────────────────────────
function RetailerSalesReport({ dealerId }: { dealerId: string }) {
  const [year, setYear] = useState(currentYear);

  const { data, isLoading } = useQuery({
    queryKey: ["report-retailer", dealerId, year],
    queryFn: () => fetchRetailerSalesReport(dealerId, year),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Retailer-wise Sales (SFT)</CardTitle>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Total SFT</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                ) : (data ?? []).map((r) => (
                  <TableRow key={r.customerId}>
                    <TableCell className="font-medium">{r.customerName}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize text-xs">{r.customerType}</Badge></TableCell>
                    <TableCell className="text-right">{r.saleCount}</TableCell>
                    <TableCell className="text-right">{r.totalSft.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalAmount)}</TableCell>
                    <TableCell className={`text-right ${r.totalDue > 0 ? "text-destructive font-semibold" : ""}`}>
                      {formatCurrency(r.totalDue)}
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

// ─── Product History ──────────────────────────────────────
function ProductHistoryReport({ dealerId }: { dealerId: string }) {
  const [productId, setProductId] = useState("");
  const [page, setPage] = useState(1);

  const { data: products } = useQuery({
    queryKey: ["products-list", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("dealer_id", dealerId)
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["report-product-history", dealerId, productId, page],
    queryFn: () => fetchProductHistory(dealerId, productId, page),
    enabled: !!productId,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="text-base">Product History</CardTitle>
        <Select value={productId} onValueChange={(v) => { setProductId(v); setPage(1); }}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select a product" />
          </SelectTrigger>
          <SelectContent>
            {(products ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!productId ? (
          <p className="text-muted-foreground text-sm">Select a product to view its purchase & sale history.</p>
        ) : isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No history</TableCell></TableRow>
                  ) : (data?.rows ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>
                        <Badge
                          variant={r.type === "purchase" ? "secondary" : "default"}
                          className="capitalize text-xs"
                        >
                          {r.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{r.reference}</TableCell>
                      <TableCell className="text-right">{r.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.rate)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(r.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalItems={data?.total ?? 0} pageSize={REPORT_PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Accounting Summary ───────────────────────────────────
function AccountingSummaryReport({ dealerId }: { dealerId: string }) {
  const [year, setYear] = useState(currentYear);
  const { isDealerAdmin } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["report-accounting", dealerId, year],
    queryFn: () => fetchAccountingSummary(dealerId, year),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Monthly Accounting Summary — {year}</CardTitle>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Purchases</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  {isDealerAdmin && <TableHead className="text-right">Profit</TableHead>}
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Cash In</TableHead>
                  <TableHead className="text-right">Cash Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((r) => (
                  <TableRow key={r.month}>
                    <TableCell className="font-medium">{r.month}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalSales)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalPurchases)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalExpenses)}</TableCell>
                    {isDealerAdmin && (
                      <TableCell className={`text-right font-semibold ${r.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                        {formatCurrency(r.netProfit)}
                      </TableCell>
                    )}
                    <TableCell className={`text-right ${r.totalDue > 0 ? "text-destructive" : ""}`}>
                      {formatCurrency(r.totalDue)}
                    </TableCell>
                    <TableCell className="text-right text-primary">{formatCurrency(r.cashIn)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(r.cashOut)}</TableCell>
                  </TableRow>
                ))}
                {/* Grand totals */}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalSales, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalPurchases, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalExpenses, 0))}</TableCell>
                  {isDealerAdmin && (
                    <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.netProfit, 0))}</TableCell>
                  )}
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalDue, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.cashIn, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.cashOut, 0))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Inventory Valuation + Aging Report ──────────────────
const AGING_META: Record<InventoryAgingRow["agingCategory"], { label: string; variant: "default" | "secondary" | "outline" | "destructive"; rowClass: string }> = {
  fast:   { label: "Fast Moving",  variant: "default",     rowClass: "" },
  normal: { label: "Normal",       variant: "secondary",   rowClass: "" },
  slow:   { label: "Slow / Dead",  variant: "destructive", rowClass: "bg-destructive/5" },
  unsold: { label: "Never Sold",   variant: "destructive", rowClass: "bg-destructive/10" },
};

function InventoryAgingReport({ dealerId }: { dealerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-inventory-aging", dealerId],
    queryFn: () => fetchInventoryAgingReport(dealerId),
    enabled: !!dealerId,
  });

  const rows = data?.rows ?? [];
  const totalFifoValue = data?.totalFifoValue ?? 0;

  const summary = {
    fast:   rows.filter((r) => r.agingCategory === "fast").length,
    normal: rows.filter((r) => r.agingCategory === "normal").length,
    slow:   rows.filter((r) => r.agingCategory === "slow" || r.agingCategory === "unsold").length,
  };

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Total FIFO Value</p>
            <p className="text-xl font-bold text-primary">{formatCurrency(totalFifoValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Fast Moving (≤30d)</p>
            <p className="text-xl font-bold text-primary">{summary.fast} SKUs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Normal (31–90d)</p>
            <p className="text-xl font-bold">{summary.normal} SKUs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Dead Stock (90d+)</p>
            <p className={`text-xl font-bold ${summary.slow > 0 ? "text-destructive" : "text-primary"}`}>{summary.slow} SKUs</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inventory Valuation &amp; Aging (FIFO)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">No in-stock products found.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Avail. Box</TableHead>
                    <TableHead className="text-right">Avail. SFT</TableHead>
                    <TableHead className="text-right">Avail. Pcs</TableHead>
                    <TableHead className="text-right">Avg Rate</TableHead>
                    <TableHead className="text-right">FIFO Value</TableHead>
                    <TableHead className="text-right">Last Sale</TableHead>
                    <TableHead>Aging</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const meta = AGING_META[r.agingCategory];
                    return (
                      <TableRow key={r.productId} className={meta.rowClass}>
                        <TableCell className="font-mono text-sm">{r.sku}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{r.name}</p>
                            {r.brand && <p className="text-xs text-muted-foreground">{r.brand}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">{r.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {r.unitType === "box_sft" ? r.boxQty : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.unitType === "box_sft" ? r.sftQty.toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.unitType === "piece" ? r.pieceQty : "—"}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(r.avgCostPerUnit)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {formatCurrency(r.fifoStockValue)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {r.lastSaleDate
                            ? `${r.lastSaleDate} (${r.daysSinceLastSale}d)`
                            : <span className="text-destructive font-medium">Never</span>
                          }
                        </TableCell>
                        <TableCell>
                          <Badge variant={meta.variant} className="text-xs whitespace-nowrap">
                            {meta.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Totals row */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={7}>Total</TableCell>
                    <TableCell className="text-right text-primary">{formatCurrency(totalFifoValue)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Low Stock Report ─────────────────────────────────────
function LowStockReport({ dealerId }: { dealerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-low-stock", dealerId],
    queryFn: () => fetchLowStockReport(dealerId),
  });

  const rows = data ?? [];
  const critical = rows.filter((r) => r.currentStock === 0).length;

  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-4">
          <Card className="flex-1 min-w-[160px]">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Low Stock SKUs</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-destructive">{rows.length}</p></CardContent>
          </Card>
          <Card className="flex-1 min-w-[160px]">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Out of Stock</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-destructive">{critical}</p></CardContent>
          </Card>
          <Card className="flex-1 min-w-[160px]">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Need Reorder</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-foreground">{rows.filter((r) => r.suggestedReorderQty > 0).length}</p></CardContent>
          </Card>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span>Low Stock Report</span>
            {rows.length > 0 && <Badge variant="destructive" className="text-xs">{rows.length} items</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <span className="text-2xl">✓</span>
              </div>
              <p className="font-medium text-foreground">All stock levels are healthy</p>
              <p className="text-sm text-muted-foreground mt-1">No products are below their reorder level</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Reorder Level</TableHead>
                    <TableHead className="text-right">Current Stock</TableHead>
                    <TableHead className="text-right">Suggested Reorder Qty</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r.productId}
                      className={r.currentStock === 0 ? "bg-destructive/5" : ""}
                    >
                      <TableCell className="font-mono text-sm">{r.sku}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.brand || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">{r.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{r.reorderLevel}</TableCell>
                      <TableCell className="text-right">
                        <span className={r.currentStock === 0 ? "text-destructive font-bold" : "text-destructive font-semibold"}>
                          {r.currentStock}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-primary">{r.suggestedReorderQty}</TableCell>
                      <TableCell>
                        {r.currentStock === 0 ? (
                          <Badge variant="destructive" className="text-xs">Out of Stock</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs bg-destructive/80">Low Stock</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Purchases Report ─────────────────────────────────────
function PurchasesReport({ dealerId }: { dealerId: string }) {
  const [mode, setMode] = useState<"daily" | "monthly">("monthly");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const { data, isLoading } = useQuery({
    queryKey: ["report-purchases", dealerId, mode, year, month],
    queryFn: async () => {
      let query = supabase
        .from("purchases")
        .select("purchase_date, total_amount, suppliers(name)")
        .eq("dealer_id", dealerId)
        .order("purchase_date");

      if (mode === "daily" && month) {
        const start = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const end = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
        query = query.gte("purchase_date", start).lte("purchase_date", end);
      } else {
        query = query.gte("purchase_date", `${year}-01-01`).lte("purchase_date", `${year}-12-31`);
      }

      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);

      const buckets: Record<string, { date: string; count: number; totalAmount: number }> = {};
      for (const row of rows ?? []) {
        const key = mode === "daily" ? row.purchase_date : row.purchase_date.substring(0, 7);
        if (!buckets[key]) buckets[key] = { date: key, count: 0, totalAmount: 0 };
        buckets[key].count += 1;
        buckets[key].totalAmount += Number(row.total_amount);
      }
      return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="text-base">Purchases Report</CardTitle>
        <div className="flex gap-2 flex-wrap">
          <Select value={mode} onValueChange={(v) => setMode(v as any)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          {mode === "daily" && (
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{mode === "daily" ? "Date" : "Month"}</TableHead>
                  <TableHead className="text-right">Purchases</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                ) : (data ?? []).map((r) => (
                  <TableRow key={r.date}>
                    <TableCell className="font-medium">{r.date}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalAmount)}</TableCell>
                  </TableRow>
                ))}
                {(data ?? []).length > 0 && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{(data ?? []).reduce((s, r) => s + r.count, 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalAmount, 0))}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Payments Report ──────────────────────────────────────
function PaymentsReport({ dealerId }: { dealerId: string }) {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const { data, isLoading } = useQuery({
    queryKey: ["report-payments", dealerId, year, month],
    queryFn: async () => {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const end = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

      const { data: sales, error } = await supabase
        .from("sales")
        .select("sale_date, invoice_number, paid_amount, payment_mode, customers(name)")
        .eq("dealer_id", dealerId)
        .gt("paid_amount", 0)
        .gte("sale_date", start)
        .lte("sale_date", end)
        .order("sale_date", { ascending: false });
      if (error) throw new Error(error.message);
      return sales ?? [];
    },
  });

  const totalPaid = (data ?? []).reduce((s, r) => s + Number(r.paid_amount), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="text-base">Payments Received</CardTitle>
        <div className="flex gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No payments</TableCell></TableRow>
                ) : (data ?? []).map((r: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{r.sale_date}</TableCell>
                    <TableCell className="font-mono text-sm">{r.invoice_number ?? "—"}</TableCell>
                    <TableCell>{r.customers?.name ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize text-xs">{r.payment_mode ?? "—"}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(r.paid_amount)}</TableCell>
                  </TableRow>
                ))}
                {(data ?? []).length > 0 && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={4}>Total</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalPaid)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ReportsPageContent;
