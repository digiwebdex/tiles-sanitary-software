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
  fetchProductsReport,
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
  { key: "daily-sales", label: "Daily Sales", icon: CalendarDays },
  { key: "sales", label: "Monthly Sales", icon: Calendar },
  { key: "sales-report", label: "Sales Report", icon: Receipt },
  { key: "inventory", label: "Inventory Report", icon: Layers },
  { key: "low-stock", label: "Low Stock Report", icon: AlertTriangle },
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
      case "daily-sales": return <DailySalesCalendar dealerId={dealerId} />;
      case "inventory": return <InventoryAgingReport dealerId={dealerId} />;
      case "low-stock": return <LowStockReport dealerId={dealerId} />;
      case "sales": return <SalesReport dealerId={dealerId} />;
      case "sales-report": return <DetailedSalesReport dealerId={dealerId} />;
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

// ─── Daily Sales Calendar ─────────────────────────────────
function DailySalesCalendar({ dealerId }: { dealerId: string }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const { data: salesData, isLoading } = useQuery({
    queryKey: ["report-daily-sales-calendar", dealerId, year, month],
    queryFn: async () => {
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;

      const { data, error } = await supabase
        .from("sales")
        .select("sale_date, total_amount, discount, paid_amount, due_amount")
        .eq("dealer_id", dealerId)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);

      if (error) throw new Error(error.message);

      // Aggregate by day
      const dayMap: Record<number, { discount: number; total: number }> = {};
      for (const row of data ?? []) {
        const day = new Date(row.sale_date).getDate();
        if (!dayMap[day]) dayMap[day] = { discount: 0, total: 0 };
        dayMap[day].discount += Number(row.discount);
        dayMap[day].total += Number(row.total_amount);
      }
      return dayMap;
    },
  });

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const monthName = currentDate.toLocaleString("default", { month: "long", year: "numeric" });

  // Build calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Create weeks array
  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = Array(firstDayOfMonth).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    currentWeek.push(d);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Daily Sales</CardTitle>
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="text-sm font-medium text-primary hover:underline">&lt;&lt;</button>
            <span className="text-sm font-semibold text-foreground min-w-[140px] text-center">{monthName}</span>
            <button onClick={nextMonth} className="text-sm font-medium text-primary hover:underline">&gt;&gt;</button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Click the date to get day's profit and/or loss report. Navigate months with &lt;&lt; / &gt;&gt;.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 bg-muted/50">
              {dayNames.map((name) => (
                <div key={name} className="px-2 py-2 text-center text-xs font-semibold text-foreground border-b border-r last:border-r-0">
                  {name}
                </div>
              ))}
            </div>
            {/* Calendar weeks */}
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((day, di) => {
                  const dayData = day ? salesData?.[day] : null;
                  return (
                    <div
                      key={di}
                      className={cn(
                        "border-b border-r last:border-r-0 min-h-[110px] p-1.5",
                        day ? "bg-card" : "bg-muted/20"
                      )}
                    >
                      {day && (
                        <>
                          <div className="text-xs font-bold text-primary mb-1">{day}</div>
                          {dayData ? (
                            <div className="space-y-0.5 text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Discount</span>
                                <span className="font-medium text-foreground">{dayData.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between pt-1 border-t border-border/50">
                                <span className="text-muted-foreground font-semibold">Total</span>
                                <span className="font-bold text-foreground">{dayData.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-muted-foreground/50 mt-2">—</div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Products Report ──────────────────────────────────────
function StockReport({ dealerId }: { dealerId: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["report-products", dealerId, page, search],
    queryFn: () => fetchProductsReport(dealerId, page, search),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-base">Products Report</CardTitle>
        <Input
          placeholder="Search…"
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
                    <TableHead>Product Code</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="text-right">Purchased</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Profit and/or Loss</TableHead>
                    <TableHead className="text-right">Stock (Qty) Amt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No products</TableCell></TableRow>
                  ) : (data?.rows ?? []).map((r) => (
                    <TableRow key={r.productId}>
                      <TableCell className="font-mono text-sm">{r.sku}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">
                        <span className="text-muted-foreground">({r.purchasedQty})</span>{" "}
                        {formatCurrency(r.purchasedAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-muted-foreground">({r.soldQty})</span>{" "}
                        {formatCurrency(r.soldAmount)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${r.profitOrLoss >= 0 ? "text-primary" : "text-destructive"}`}>
                        {formatCurrency(r.profitOrLoss)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-muted-foreground">({r.stockQty})</span>{" "}
                        {formatCurrency(r.stockAmount)}
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
      <CardHeader><CardTitle className="text-base">Brands Report</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Purchased</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Purchased Amount</TableHead>
                  <TableHead className="text-right">Sold Amount</TableHead>
                  <TableHead className="text-right">Profit and/or Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                ) : (
                  <>
                    {(data ?? []).map((r) => (
                      <TableRow key={r.brand}>
                        <TableCell className="font-medium">{r.brand}</TableCell>
                        <TableCell className="text-right">{r.purchasedQty.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{r.soldQty.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.purchasedAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.soldAmount)}</TableCell>
                        <TableCell className={`text-right font-semibold ${r.profitOrLoss >= 0 ? "text-primary" : "text-destructive"}`}>
                          {formatCurrency(r.profitOrLoss)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell>[Brand]</TableCell>
                      <TableCell className="text-right">{(data ?? []).reduce((s, r) => s + r.purchasedQty, 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(data ?? []).reduce((s, r) => s + r.soldQty, 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.purchasedAmount, 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.soldAmount, 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.profitOrLoss, 0))}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Detailed Sales Report ────────────────────────────────
function DetailedSalesReport({ dealerId }: { dealerId: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const PAGE_SIZE = 25;

  const { data, isLoading } = useQuery({
    queryKey: ["report-detailed-sales", dealerId, page, search],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("sales")
        .select("id, created_at, invoice_number, sale_date, total_amount, paid_amount, due_amount, sale_status, customer_id, customers(name)", { count: "exact" })
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (search?.trim()) {
        query = query.or(`invoice_number.ilike.%${search.trim()}%,customers.name.ilike.%${search.trim()}%`);
      }

      const { data: sales, error, count } = await query;
      if (error) throw new Error(error.message);

      // Fetch sale_items with product info for these sales
      const saleIds = (sales ?? []).map((s: any) => s.id);
      let itemsMap: Record<string, { name: string; qty: number }[]> = {};
      if (saleIds.length > 0) {
        const { data: items } = await supabase
          .from("sale_items")
          .select("sale_id, quantity, products(name, size, unit_type, category)")
          .in("sale_id", saleIds);

        for (const item of items ?? []) {
          const sid = (item as any).sale_id;
          if (!itemsMap[sid]) itemsMap[sid] = [];
          const p = (item as any).products;
          const label = p ? `${p.category === "tiles" ? (p.name?.includes("Wall") ? "Wall Tiles" : (p.name?.includes("Floor") ? "Floor Tiles" : p.name)) : p.name}${p.size ? ` (Size: ${p.size})` : ""} (${p.unit_type === "box_sft" ? "Box" : "Pcs"})` : "Product";
          itemsMap[sid].push({ name: label, qty: Number((item as any).quantity) });
        }
      }

      return { sales: sales ?? [], total: count ?? 0, itemsMap };
    },
  });

  const sales = data?.sales ?? [];
  const total = data?.total ?? 0;

  const paymentBadge = (due: number, paid: number) => {
    if (due <= 0) return <Badge className="bg-green-600 text-white hover:bg-green-700 text-xs">Paid</Badge>;
    if (paid > 0) return <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-xs">Partial</Badge>;
    return <Badge className="bg-orange-100 text-orange-700 text-xs">Pending</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-base">Sales Report</CardTitle>
        <Input
          placeholder="Search by invoice or customer…"
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
                    <TableHead>Date</TableHead>
                    <TableHead>Reference No</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product (Qty)</TableHead>
                    <TableHead className="text-right">Grand Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Payment Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No sales found</TableCell></TableRow>
                  ) : sales.map((s: any) => {
                    const due = Number(s.due_amount) || 0;
                    const paid = Number(s.paid_amount) || 0;
                    const items = data?.itemsMap?.[s.id] ?? [];
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(s.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
                          <span className="text-muted-foreground">{new Date(s.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{s.invoice_number ?? "—"}</TableCell>
                        <TableCell>{(s.customers as any)?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs max-w-[250px]">
                          {items.length > 0 ? (
                            <div className="space-y-0.5">
                              {items.map((it, idx) => (
                                <div key={idx} className="text-muted-foreground">
                                  {it.name} ({it.qty})
                                </div>
                              ))}
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(s.total_amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(paid)}</TableCell>
                        <TableCell className={`text-right ${due > 0 ? "text-destructive font-semibold" : ""}`}>{formatCurrency(due)}</TableCell>
                        <TableCell>{paymentBadge(due, paid)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Monthly Sales Report (Card Grid) ─────────────────────
function SalesReport({ dealerId }: { dealerId: string }) {
  const [year, setYear] = useState(currentYear);

  const { data: salesData, isLoading } = useQuery({
    queryKey: ["report-monthly-sales-grid", dealerId, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("sale_date, total_amount, discount")
        .eq("dealer_id", dealerId)
        .gte("sale_date", `${year}-01-01`)
        .lte("sale_date", `${year}-12-31`);

      if (error) throw new Error(error.message);

      const monthMap: Record<number, { discount: number; total: number }> = {};
      for (const row of data ?? []) {
        const m = new Date(row.sale_date).getMonth();
        if (!monthMap[m]) monthMap[m] = { discount: 0, total: 0 };
        monthMap[m].discount += Number(row.discount);
        monthMap[m].total += Number(row.total_amount);
      }
      return monthMap;
    },
  });

  const allMonths = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const prevYear = () => setYear((y) => y - 1);
  const nextYear = () => setYear((y) => y + 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Monthly Sales</CardTitle>
          <div className="flex items-center gap-3">
            <button onClick={prevYear} className="text-sm font-medium text-primary hover:underline">&lt;&lt;</button>
            <span className="text-sm font-semibold text-foreground min-w-[60px] text-center">{year}</span>
            <button onClick={nextYear} className="text-sm font-medium text-primary hover:underline">&gt;&gt;</button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Navigate years with &lt;&lt; / &gt;&gt;.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            {/* Month headers */}
            <div className="grid grid-cols-12 bg-muted/50">
              {allMonths.map((m) => (
                <div key={m} className="px-1 py-2 text-center text-xs font-semibold text-foreground border-b border-r last:border-r-0 truncate">
                  {m}
                </div>
              ))}
            </div>
            {/* Month cells */}
            <div className="grid grid-cols-12">
              {allMonths.map((m, i) => {
                const md = salesData?.[i];
                return (
                  <div key={m} className="border-r last:border-r-0 min-h-[120px] p-2 bg-card">
                    {md && md.total > 0 ? (
                      <div className="space-y-1.5 text-[11px]">
                        <div className="text-center">
                          <span className="text-primary font-medium">Discount</span>
                          <div className="font-medium text-foreground">{md.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                        <div className="border-t border-border/50 pt-1.5 text-center">
                          <span className="text-primary font-medium">Total</span>
                          <div className="font-bold text-foreground">{md.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <span className="text-sm font-semibold text-muted-foreground/40">0</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const PAGE_SIZE = 25;

  const { data, isLoading } = useQuery({
    queryKey: ["report-payments-v2", dealerId, page, search],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Fetch customer_ledger entries (sale payments, receipts, refunds)
      let clQuery = supabase
        .from("customer_ledger")
        .select("id, created_at, entry_date, type, amount, description, sale_id, sales_return_id, customer_id", { count: "exact" })
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (search?.trim()) {
        clQuery = clQuery.ilike("description", `%${search.trim()}%`);
      }

      const { data: ledgerRows, error, count } = await clQuery;
      if (error) throw new Error(error.message);

      // Gather sale_ids to fetch invoice_numbers
      const saleIds = (ledgerRows ?? []).map((r: any) => r.sale_id).filter(Boolean);
      let saleMap: Record<string, string> = {};
      if (saleIds.length > 0) {
        const { data: sales } = await supabase
          .from("sales")
          .select("id, invoice_number, payment_mode")
          .in("id", saleIds);
        for (const s of sales ?? []) {
          saleMap[s.id] = s.invoice_number ?? "";
        }
      }

      // Build payment reference from description or type
      const rows = (ledgerRows ?? []).map((r: any) => {
        const isReturn = r.type === "refund" || r.sales_return_id;
        const saleRef = r.sale_id ? (saleMap[r.sale_id] || r.sale_id.substring(0, 12)) : "";
        const payRef = r.description || r.type;
        const paidBy = "Cash"; // default
        const entryType = r.type === "receipt" || r.type === "payment" ? "Received" : r.type === "refund" ? "Return Paid" : r.type === "sale" ? "Received" : r.type;

        return {
          id: r.id,
          created_at: r.created_at,
          paymentRef: isReturn ? "Return Paid" : (payRef ?? "—"),
          saleRef: saleRef ? `SALE${saleRef}` : "—",
          purchaseRef: "",
          paidBy,
          amount: Number(r.amount),
          type: entryType,
        };
      });

      return { rows, total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-base">Payments Report</CardTitle>
        <Input
          placeholder="Search…"
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
                    <TableHead>Date</TableHead>
                    <TableHead>Payment Reference</TableHead>
                    <TableHead>Sale Reference</TableHead>
                    <TableHead>Purchase Reference</TableHead>
                    <TableHead>Paid by</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No payments found</TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(r.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
                        <span className="text-muted-foreground">{new Date(r.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{r.paymentRef}</TableCell>
                      <TableCell className="font-mono text-sm">{r.saleRef}</TableCell>
                      <TableCell className="font-mono text-sm">{r.purchaseRef || "—"}</TableCell>
                      <TableCell>{r.paidBy}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(r.amount)}</TableCell>
                      <TableCell>
                        <Badge className="bg-green-600 text-white hover:bg-green-700 text-xs">{r.type}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ReportsPageContent;
