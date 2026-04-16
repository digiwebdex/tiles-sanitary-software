import { useState } from "react";
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
import { exportToExcel } from "@/lib/exportUtils";
import { usePermissions } from "@/hooks/usePermissions";
import {
  SalesBySalesmanReport,
  SupplierOutstandingReport,
  PendingDeliveryReport,
  DeliveryStatusReport,
  StockMovementReport,
} from "./AdditionalReports";
import {
  BackorderReport,
  PendingFulfillmentReport,
  ShortageDemandReport,
  CustomerPendingDeliveryReport,
} from "./BackorderReports";
import {
  BatchStockReport,
  MixedBatchSalesReport,
  AgingBatchReport,
  BatchMovementReport,
} from "./BatchReports";
import {
  ReservedStockReport,
  FreeVsReservedReport,
  ExpiringReservationsReport,
  CustomerReservedStockReport,
  BatchReservedStockReport,
} from "./ReservationReports";
import { cn } from "@/lib/utils";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  BarChart3, Package, Layers, Tags, AlertTriangle,
  Receipt, CalendarDays, Calendar, CreditCard,
  ShoppingCart, DollarSign, Users, History, BookOpen, Clock, TrendingUp,
  ChevronDown, GitBranch, Shield, Lock,
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

// Reports that require admin-only access
const ADMIN_ONLY_REPORTS = new Set([
  "profit-analysis", "accounting", "supplier-outstanding", "purchases",
]);

const reportGroups = [
  {
    label: "Sales & Revenue",
    icon: Receipt,
    items: [
      { key: "daily-sales", label: "Daily Sales", icon: CalendarDays },
      { key: "sales", label: "Monthly Sales", icon: Calendar },
      { key: "monthly-summary", label: "Monthly Summary", icon: BookOpen },
      { key: "sales-report", label: "Sales Report", icon: Receipt },
      { key: "sales-by-salesman", label: "Sales by Salesman", icon: Users },
      { key: "profit-analysis", label: "Profit Analysis", icon: TrendingUp },
    ],
  },
  {
    label: "Inventory",
    icon: Package,
    items: [
      { key: "stock", label: "Products Report", icon: Package },
      { key: "brand-stock", label: "Brands Report", icon: Tags },
      { key: "inventory", label: "Inventory Report", icon: Layers },
      { key: "low-stock", label: "Low Stock Report", icon: AlertTriangle },
      { key: "stock-movement", label: "Stock Movement", icon: History },
      { key: "product-history", label: "Product History", icon: History },
    ],
  },
  {
    label: "Customers & Payments",
    icon: Users,
    items: [
      { key: "retailer", label: "Customers Report", icon: Users },
      { key: "payments", label: "Payments Report", icon: CreditCard },
      { key: "due-aging", label: "Due Aging", icon: Clock },
      { key: "supplier-outstanding", label: "Supplier Outstanding", icon: ShoppingCart },
    ],
  },
  {
    label: "Deliveries",
    icon: Package,
    items: [
      { key: "pending-delivery", label: "Pending Deliveries", icon: AlertTriangle },
      { key: "delivery-status", label: "Delivery Status", icon: Package },
    ],
  },
  {
    label: "Backorder & Fulfillment",
    icon: Layers,
    items: [
      { key: "backorder", label: "Backorder Report", icon: AlertTriangle },
      { key: "pending-fulfillment", label: "Pending Fulfillment", icon: Clock },
      { key: "shortage-demand", label: "Shortage Demand", icon: Tags },
      { key: "customer-pending-delivery", label: "Customer Pending", icon: Users },
    ],
  },
  {
    label: "Batch Tracking",
    icon: GitBranch,
    items: [
      { key: "batch-stock", label: "Batch Stock", icon: Layers },
      { key: "batch-movement", label: "Batch Movement", icon: GitBranch },
      { key: "mixed-batch-sales", label: "Mixed Batch Sales", icon: AlertTriangle },
      { key: "batch-aging", label: "Batch Aging", icon: Clock },
    ],
  },
  {
    label: "Stock Reservations",
    icon: Shield,
    items: [
      { key: "reserved-stock", label: "Reserved Stock", icon: Lock },
      { key: "free-vs-reserved", label: "Free vs Reserved", icon: Shield },
      { key: "expiring-reservations", label: "Expiring Holds", icon: Clock },
      { key: "customer-reserved", label: "Customer Reserved", icon: Users },
      { key: "batch-reserved", label: "Batch Reserved", icon: GitBranch },
    ],
  },
  {
    label: "Purchases & Expenses",
    icon: ShoppingCart,
    items: [
      { key: "purchases", label: "Purchases Report", icon: ShoppingCart },
      { key: "accounting", label: "Expenses Report", icon: DollarSign },
    ],
  },
];

// Flat list for mobile tab bar
const reportNavItems = reportGroups.flatMap((g) => g.items);

const ReportsPageContent = ({ dealerId }: ReportsPageContentProps) => {
  const [activeReport, setActiveReport] = useState("stock");
  const permissions = usePermissions();

  // Filter out admin-only reports for non-privileged users
  const filteredGroups = permissions.canViewProfit
    ? reportGroups
    : reportGroups
        .map((g) => ({ ...g, items: g.items.filter((i) => !ADMIN_ONLY_REPORTS.has(i.key)) }))
        .filter((g) => g.items.length > 0);

  const filteredNavItems = filteredGroups.flatMap((g) => g.items);

  const renderReport = () => {
    switch (activeReport) {
      case "stock": return <StockReport dealerId={dealerId} />;

      case "brand-stock": return <BrandStockReport dealerId={dealerId} />;
      case "daily-sales": return <DailySalesCalendar dealerId={dealerId} />;
      case "monthly-summary": return <MonthlySummaryReport dealerId={dealerId} />;
      case "inventory": return <InventoryAgingReport dealerId={dealerId} />;
      case "low-stock": return <LowStockReport dealerId={dealerId} />;
      case "sales": return <SalesReport dealerId={dealerId} />;
      case "sales-report": return <DetailedSalesReport dealerId={dealerId} />;
      case "sales-by-salesman": return <SalesBySalesmanReport dealerId={dealerId} />;
      case "purchases": return <PurchasesReport dealerId={dealerId} />;
      case "payments": return <PaymentsReport dealerId={dealerId} />;
      case "retailer": return <RetailerSalesReport dealerId={dealerId} />;
      case "product-history": return <ProductHistoryReport dealerId={dealerId} />;
      case "accounting": return <AccountingSummaryReport dealerId={dealerId} />;
      case "due-aging": return <DueAgingReport dealerId={dealerId} />;
      case "profit-analysis": return <ProfitAnalysisReport dealerId={dealerId} />;
      case "supplier-outstanding": return <SupplierOutstandingReport dealerId={dealerId} />;
      case "pending-delivery": return <PendingDeliveryReport dealerId={dealerId} />;
      case "delivery-status": return <DeliveryStatusReport dealerId={dealerId} />;
      case "stock-movement": return <StockMovementReport dealerId={dealerId} />;
      case "backorder": return <BackorderReport dealerId={dealerId} />;
      case "pending-fulfillment": return <PendingFulfillmentReport dealerId={dealerId} />;
      case "shortage-demand": return <ShortageDemandReport dealerId={dealerId} />;
      case "customer-pending-delivery": return <CustomerPendingDeliveryReport dealerId={dealerId} />;
      case "batch-stock": return <BatchStockReport dealerId={dealerId} />;
      case "batch-movement": return <BatchMovementReport dealerId={dealerId} />;
      case "mixed-batch-sales": return <MixedBatchSalesReport dealerId={dealerId} />;
      case "batch-aging": return <AgingBatchReport dealerId={dealerId} />;
      case "reserved-stock": return <ReservedStockReport dealerId={dealerId} />;
      case "free-vs-reserved": return <FreeVsReservedReport dealerId={dealerId} />;
      case "expiring-reservations": return <ExpiringReservationsReport dealerId={dealerId} />;
      case "customer-reserved": return <CustomerReservedStockReport dealerId={dealerId} />;
      case "batch-reserved": return <BatchReservedStockReport dealerId={dealerId} />;
      default: return <StockReport dealerId={dealerId} />;
    }
  };

  // Find which group the active report belongs to
  const activeGroup = filteredGroups.find((g) => g.items.some((i) => i.key === activeReport));

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col md:flex-row">
      {/* Desktop: Accordion sidebar */}
      <aside className="hidden md:block w-60 shrink-0 border-r bg-card overflow-y-auto">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Reports</h2>
        </div>
        <nav className="p-2 space-y-1">
          {filteredGroups.map((group) => {
            const isGroupActive = group.items.some((i) => i.key === activeReport);
            return (
              <Collapsible key={group.label} defaultOpen={isGroupActive}>
                <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors group">
                  <span className="flex items-center gap-2">
                    <group.icon className="h-3.5 w-3.5" />
                    {group.label}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-0.5 space-y-0.5 pl-2">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setActiveReport(item.key)}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-1.5 text-[13px] rounded-md transition-colors",
                        activeReport === item.key
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                      {item.label}
                    </button>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </nav>
      </aside>

      {/* Mobile: Horizontal scrollable tabs */}
      <div className="md:hidden border-b bg-card px-4 pt-3">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Reports</h2>
        </div>
        <div className="flex overflow-x-auto gap-0 -mb-px">
          {filteredNavItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveReport(item.key)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[13px] transition-colors border-b-2 shrink-0",
                activeReport === item.key
                  ? "border-b-primary text-primary font-medium"
                  : "border-b-transparent text-muted-foreground hover:text-foreground hover:border-b-muted-foreground/30"
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 lg:p-6">
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
  const { canViewProfit } = usePermissions();

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
                    {canViewProfit && <TableHead className="text-right">Profit and/or Loss</TableHead>}
                    <TableHead className="text-right">Stock (Qty) Amt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={canViewProfit ? 6 : 5} className="text-center text-muted-foreground">No products</TableCell></TableRow>
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
                      {canViewProfit && (
                        <TableCell className={`text-right font-semibold ${r.profitOrLoss >= 0 ? "text-primary" : "text-destructive"}`}>
                          {formatCurrency(r.profitOrLoss)}
                        </TableCell>
                      )}
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
  const { canViewProfit } = usePermissions();
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
                  {canViewProfit && <TableHead className="text-right">Profit and/or Loss</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={canViewProfit ? 6 : 5} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                ) : (
                  <>
                    {(data ?? []).map((r) => (
                      <TableRow key={r.brand}>
                        <TableCell className="font-medium">{r.brand}</TableCell>
                        <TableCell className="text-right">{r.purchasedQty.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{r.soldQty.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.purchasedAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.soldAmount)}</TableCell>
                        {canViewProfit && (
                          <TableCell className={`text-right font-semibold ${r.profitOrLoss >= 0 ? "text-primary" : "text-destructive"}`}>
                            {formatCurrency(r.profitOrLoss)}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell>[Brand]</TableCell>
                      <TableCell className="text-right">{(data ?? []).reduce((s, r) => s + r.purchasedQty, 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(data ?? []).reduce((s, r) => s + r.soldQty, 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.purchasedAmount, 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.soldAmount, 0))}</TableCell>
                      {canViewProfit && <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.profitOrLoss, 0))}</TableCell>}
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

// ─── Customers Report ─────────────────────────────────────
function RetailerSalesReport({ dealerId }: { dealerId: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const PAGE_SIZE = 25;

  const { data, isLoading } = useQuery({
    queryKey: ["report-customers-v2", dealerId, page, search],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("customers")
        .select("id, name, phone, email, opening_balance", { count: "exact" })
        .eq("dealer_id", dealerId)
        .order("name")
        .range(from, to);

      if (search?.trim()) {
        query = query.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`);
      }

      const { data: customers, error, count } = await query;
      if (error) throw new Error(error.message);

      // Fetch sales aggregates for these customers
      const customerIds = (customers ?? []).map((c: any) => c.id);
      let salesMap: Record<string, { count: number; totalAmount: number; paidAmount: number }> = {};

      if (customerIds.length > 0) {
        const { data: sales } = await supabase
          .from("sales")
          .select("customer_id, total_amount, paid_amount")
          .eq("dealer_id", dealerId)
          .in("customer_id", customerIds);

        for (const s of sales ?? []) {
          const cid = (s as any).customer_id;
          if (!salesMap[cid]) salesMap[cid] = { count: 0, totalAmount: 0, paidAmount: 0 };
          salesMap[cid].count += 1;
          salesMap[cid].totalAmount += Number((s as any).total_amount);
          salesMap[cid].paidAmount += Number((s as any).paid_amount);
        }
      }

      return { customers: customers ?? [], total: count ?? 0, salesMap };
    },
  });

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <div>
          <CardTitle className="text-base">Customers Report</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Click view report to check the customer report.</p>
        </div>
        <Input
          placeholder="Search by name or phone…"
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
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email Address</TableHead>
                    <TableHead className="text-right">Opening Balance</TableHead>
                    <TableHead className="text-right">Total Sales</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No customers found</TableCell></TableRow>
                  ) : customers.map((c: any) => {
                    const sm = data?.salesMap?.[c.id];
                    const totalAmt = sm?.totalAmount ?? 0;
                    const paid = sm?.paidAmount ?? 0;
                    const balance = totalAmt - paid;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-sm">{c.phone ?? "—"}</TableCell>
                        <TableCell className="text-sm">{c.email ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatCurrency(c.opening_balance)}</TableCell>
                        <TableCell className="text-right">{sm?.count ?? 0}</TableCell>
                        <TableCell className="text-right">{formatCurrency(totalAmt)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(paid)}</TableCell>
                        <TableCell className={`text-right ${balance > 0 ? "text-destructive font-semibold" : ""}`}>
                          {formatCurrency(balance)}
                        </TableCell>
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

// ─── Monthly Summary Report (Sales/Collection/Due/SFT) ───
function MonthlySummaryReport({ dealerId }: { dealerId: string }) {
  const [year, setYear] = useState(currentYear);

  const { data, isLoading } = useQuery({
    queryKey: ["report-monthly-summary", dealerId, year],
    queryFn: async () => {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;

      const [salesRes, paymentsRes] = await Promise.all([
        supabase
          .from("sales")
          .select("sale_date, total_amount, paid_amount, due_amount, total_sft")
          .eq("dealer_id", dealerId)
          .gte("sale_date", yearStart)
          .lte("sale_date", yearEnd),
        supabase
          .from("customer_ledger")
          .select("entry_date, amount, type")
          .eq("dealer_id", dealerId)
          .in("type", ["payment", "receipt"])
          .gte("entry_date", yearStart)
          .lte("entry_date", yearEnd),
      ]);

      const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const buckets = MONTHS.map((m) => ({
        month: m,
        totalSales: 0,
        totalCollection: 0,
        totalDue: 0,
        totalSft: 0,
        paymentReceived: 0,
      }));

      for (const r of salesRes.data ?? []) {
        const m = new Date(r.sale_date).getMonth();
        buckets[m].totalSales += Number(r.total_amount);
        buckets[m].totalCollection += Number(r.paid_amount);
        buckets[m].totalDue += Number(r.due_amount);
        buckets[m].totalSft += Number(r.total_sft);
      }

      for (const r of paymentsRes.data ?? []) {
        const m = new Date(r.entry_date).getMonth();
        buckets[m].paymentReceived += Math.abs(Number(r.amount));
      }

      return buckets;
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Monthly Summary — {year}</CardTitle>
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
                  <TableHead className="text-right">Sales (৳)</TableHead>
                  <TableHead className="text-right">Collection (৳)</TableHead>
                  <TableHead className="text-right">Due (৳)</TableHead>
                  <TableHead className="text-right">Payment Received (৳)</TableHead>
                  <TableHead className="text-right">Total SFT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((r) => (
                  <TableRow key={r.month}>
                    <TableCell className="font-medium">{r.month}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalSales)}</TableCell>
                    <TableCell className="text-right text-primary">{formatCurrency(r.totalCollection)}</TableCell>
                    <TableCell className={`text-right ${r.totalDue > 0 ? "text-destructive" : ""}`}>
                      {formatCurrency(r.totalDue)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(r.paymentReceived)}</TableCell>
                    <TableCell className="text-right">{r.totalSft.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {/* Totals */}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalSales, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalCollection, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.totalDue, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency((data ?? []).reduce((s, r) => s + r.paymentReceived, 0))}</TableCell>
                  <TableCell className="text-right">{(data ?? []).reduce((s, r) => s + r.totalSft, 0).toFixed(2)}</TableCell>
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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const PAGE_SIZE = 25;

  const { data, isLoading } = useQuery({
    queryKey: ["report-purchases-v2", dealerId, page, search],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("purchases")
        .select("id, created_at, invoice_number, purchase_date, total_amount, supplier_id, suppliers(name)", { count: "exact" })
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (search?.trim()) {
        query = query.or(`invoice_number.ilike.%${search.trim()}%,suppliers.name.ilike.%${search.trim()}%`);
      }

      const { data: purchases, error, count } = await query;
      if (error) throw new Error(error.message);

      // Fetch purchase_items with product info
      const purchaseIds = (purchases ?? []).map((p: any) => p.id);
      let itemsMap: Record<string, { name: string; qty: number }[]> = {};
      if (purchaseIds.length > 0) {
        const { data: items } = await supabase
          .from("purchase_items")
          .select("purchase_id, quantity, products(name, size, unit_type, category)")
          .in("purchase_id", purchaseIds);

        for (const item of items ?? []) {
          const pid = (item as any).purchase_id;
          if (!itemsMap[pid]) itemsMap[pid] = [];
          const p = (item as any).products;
          const label = p ? `${p.name}${p.size ? ` (Size: ${p.size})` : ""} (${p.unit_type === "box_sft" ? "Box" : "Pcs"})` : "Product";
          itemsMap[pid].push({ name: label, qty: Number((item as any).quantity) });
        }
      }

      // Fetch supplier_ledger payments for these purchases
      let paidMap: Record<string, number> = {};
      if (purchaseIds.length > 0) {
        const { data: ledger } = await supabase
          .from("supplier_ledger")
          .select("purchase_id, amount, type")
          .in("purchase_id", purchaseIds)
          .in("type", ["payment"]);

        for (const entry of ledger ?? []) {
          const pid = (entry as any).purchase_id;
          if (!paidMap[pid]) paidMap[pid] = 0;
          paidMap[pid] += Number((entry as any).amount);
        }
      }

      return { purchases: purchases ?? [], total: count ?? 0, itemsMap, paidMap };
    },
  });

  const purchases = data?.purchases ?? [];
  const total = data?.total ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-base">Purchases Report</CardTitle>
        <Input
          placeholder="Search by invoice or supplier…"
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
                    <TableHead>Supplier</TableHead>
                    <TableHead>Product (Qty)</TableHead>
                    <TableHead className="text-right">Grand Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No purchases found</TableCell></TableRow>
                  ) : purchases.map((p: any) => {
                    const totalAmt = Number(p.total_amount) || 0;
                    const paid = data?.paidMap?.[p.id] ?? 0;
                    const balance = totalAmt - paid;
                    const items = data?.itemsMap?.[p.id] ?? [];
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(p.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
                          <span className="text-muted-foreground">{new Date(p.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{p.invoice_number ?? "—"}</TableCell>
                        <TableCell>{(p.suppliers as any)?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs max-w-[280px]">
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
                        <TableCell className="text-right font-medium">{formatCurrency(totalAmt)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(paid)}</TableCell>
                        <TableCell className={`text-right ${balance > 0 ? "text-destructive font-semibold" : ""}`}>{formatCurrency(balance)}</TableCell>
                        <TableCell>
                          <Badge className="bg-green-600 text-white hover:bg-green-700 text-xs">Received</Badge>
                        </TableCell>
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

// ─── Due Aging Report ─────────────────────────────────────
function DueAgingReport({ dealerId }: { dealerId: string }) {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["report-due-aging", dealerId],
    queryFn: async () => {
      // Get all customers
      const { data: customers, error: cErr } = await supabase
        .from("customers")
        .select("id, name, phone, type")
        .eq("dealer_id", dealerId)
        .eq("status", "active")
        .order("name");
      if (cErr) throw new Error(cErr.message);

      // Get all unpaid sales
      const { data: sales, error: sErr } = await supabase
        .from("sales")
        .select("id, customer_id, sale_date, due_amount, total_amount, invoice_number")
        .eq("dealer_id", dealerId)
        .gt("due_amount", 0);
      if (sErr) throw new Error(sErr.message);

      const today = new Date();
      const msPerDay = 86_400_000;

      // Build per-customer aging
      const customerMap = new Map<string, {
        name: string; phone: string | null; type: string;
        current: number; d30: number; d60: number; d90: number; d90plus: number;
        total: number; invoices: { id: string; invoice_number: string | null; sale_date: string; due_amount: number; days: number }[];
      }>();

      for (const c of customers ?? []) {
        customerMap.set(c.id, { name: c.name, phone: c.phone, type: c.type, current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0, invoices: [] });
      }

      for (const s of sales ?? []) {
        const cust = customerMap.get(s.customer_id);
        if (!cust) continue;
        const due = Number(s.due_amount);
        const days = Math.max(0, Math.floor((today.getTime() - new Date(s.sale_date).getTime()) / msPerDay));

        if (days <= 0) cust.current += due;
        else if (days <= 30) cust.d30 += due;
        else if (days <= 60) cust.d60 += due;
        else if (days <= 90) cust.d90 += due;
        else cust.d90plus += due;

        cust.total += due;
        cust.invoices.push({ id: s.id, invoice_number: s.invoice_number, sale_date: s.sale_date, due_amount: due, days });
      }

      // Filter out customers with zero due
      const results = Array.from(customerMap.entries())
        .filter(([, v]) => v.total > 0)
        .map(([id, v]) => ({ id, ...v, invoices: v.invoices.sort((a, b) => b.days - a.days) }))
        .sort((a, b) => b.total - a.total);

      return results;
    },
  });

  const rows = (data ?? []).filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone && c.phone.includes(search))
  );

  const totals = rows.reduce(
    (acc, r) => ({
      current: acc.current + r.current,
      d30: acc.d30 + r.d30,
      d60: acc.d60 + r.d60,
      d90: acc.d90 + r.d90,
      d90plus: acc.d90plus + r.d90plus,
      total: acc.total + r.total,
    }),
    { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: "Current", value: totals.current, color: "text-primary" },
          { label: "1-30 Days", value: totals.d30, color: "text-foreground" },
          { label: "31-60 Days", value: totals.d60, color: "text-foreground" },
          { label: "61-90 Days", value: totals.d90, color: "text-destructive" },
          { label: "90+ Days", value: totals.d90plus, color: "text-destructive" },
          { label: "Total Due", value: totals.total, color: "text-foreground" },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-lg font-bold ${c.color}`}>৳{Math.round(c.value).toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Input
        placeholder="Search customer..."
        className="max-w-xs"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">1-30 Days</TableHead>
                  <TableHead className="text-right">31-60 Days</TableHead>
                  <TableHead className="text-right">61-90 Days</TableHead>
                  <TableHead className="text-right text-destructive">90+ Days</TableHead>
                  <TableHead className="text-right font-bold">Total Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No overdue invoices found</TableCell></TableRow>
                ) : (
                  <>
                    {rows.map((r) => (
                      <TableRow key={r.id} className={r.d90plus > 0 ? "bg-destructive/5" : ""}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{r.name}</p>
                            {r.phone && <p className="text-xs text-muted-foreground">{r.phone}</p>}
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{r.type}</Badge></TableCell>
                        <TableCell className="text-right">{r.current > 0 ? `৳${Math.round(r.current).toLocaleString()}` : "—"}</TableCell>
                        <TableCell className="text-right">{r.d30 > 0 ? `৳${Math.round(r.d30).toLocaleString()}` : "—"}</TableCell>
                        <TableCell className="text-right">{r.d60 > 0 ? `৳${Math.round(r.d60).toLocaleString()}` : "—"}</TableCell>
                        <TableCell className="text-right font-medium">{r.d90 > 0 ? `৳${Math.round(r.d90).toLocaleString()}` : "—"}</TableCell>
                        <TableCell className="text-right font-semibold text-destructive">{r.d90plus > 0 ? `৳${Math.round(r.d90plus).toLocaleString()}` : "—"}</TableCell>
                        <TableCell className="text-right font-bold">৳{Math.round(r.total).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                    {/* Totals footer */}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell className="text-right">৳{Math.round(totals.current).toLocaleString()}</TableCell>
                      <TableCell className="text-right">৳{Math.round(totals.d30).toLocaleString()}</TableCell>
                      <TableCell className="text-right">৳{Math.round(totals.d60).toLocaleString()}</TableCell>
                      <TableCell className="text-right">৳{Math.round(totals.d90).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-destructive">৳{Math.round(totals.d90plus).toLocaleString()}</TableCell>
                      <TableCell className="text-right">৳{Math.round(totals.total).toLocaleString()}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Profit Analysis per Product ───────────────────────────
function ProfitAnalysisReport({ dealerId }: { dealerId: string }) {
  const { isDealerAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"profit" | "margin" | "revenue">("profit");

  const { data, isLoading } = useQuery({
    queryKey: ["report-profit-analysis", dealerId],
    queryFn: async () => {
      // Get all products
      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("id, sku, name, brand, category, unit_type")
        .eq("dealer_id", dealerId)
        .eq("active", true);
      if (pErr) throw new Error(pErr.message);

      // Get all sale items with cost info
      const { data: saleItems, error: siErr } = await supabase
        .from("sale_items")
        .select("product_id, quantity, sale_rate, total, total_sft")
        .eq("dealer_id", dealerId);
      if (siErr) throw new Error(siErr.message);

      // Get stock for avg cost
      const { data: stocks, error: stErr } = await supabase
        .from("stock")
        .select("product_id, average_cost_per_unit")
        .eq("dealer_id", dealerId);
      if (stErr) throw new Error(stErr.message);

      // Get purchase items for weighted avg cost (more accurate)
      const { data: purchaseItems, error: piErr } = await supabase
        .from("purchase_items")
        .select("product_id, quantity, landed_cost")
        .eq("dealer_id", dealerId);
      if (piErr) throw new Error(piErr.message);

      const costMap = new Map<string, number>();
      const costQtyMap = new Map<string, { totalCost: number; totalQty: number }>();

      // Build weighted avg cost from purchase items
      for (const pi of purchaseItems ?? []) {
        const cur = costQtyMap.get(pi.product_id) ?? { totalCost: 0, totalQty: 0 };
        const qty = Number(pi.quantity) || 0;
        const cost = Number(pi.landed_cost) || 0;
        cur.totalCost += cost * qty;
        cur.totalQty += qty;
        costQtyMap.set(pi.product_id, cur);
      }

      for (const [pid, val] of costQtyMap) {
        costMap.set(pid, val.totalQty > 0 ? val.totalCost / val.totalQty : 0);
      }

      // Fallback to stock avg cost
      for (const s of stocks ?? []) {
        if (!costMap.has(s.product_id)) {
          costMap.set(s.product_id, Number(s.average_cost_per_unit) || 0);
        }
      }

      // Aggregate sales per product
      const salesAgg = new Map<string, { qtySold: number; revenue: number; totalSft: number }>();
      for (const si of saleItems ?? []) {
        const cur = salesAgg.get(si.product_id) ?? { qtySold: 0, revenue: 0, totalSft: 0 };
        cur.qtySold += Number(si.quantity) || 0;
        cur.revenue += Number(si.total) || 0;
        cur.totalSft += Number(si.total_sft) || 0;
        salesAgg.set(si.product_id, cur);
      }

      const rows = (products ?? [])
        .map((p) => {
          const sales = salesAgg.get(p.id) ?? { qtySold: 0, revenue: 0, totalSft: 0 };
          const avgCost = costMap.get(p.id) ?? 0;
          const cogs = sales.qtySold * avgCost;
          const profit = sales.revenue - cogs;
          const marginPct = sales.revenue > 0 ? (profit / sales.revenue) * 100 : 0;
          const avgSaleRate = sales.qtySold > 0 ? sales.revenue / sales.qtySold : 0;

          return {
            id: p.id,
            sku: p.sku,
            name: p.name,
            brand: p.brand ?? "—",
            category: p.category,
            qtySold: Math.round(sales.qtySold * 100) / 100,
            totalSft: Math.round(sales.totalSft * 100) / 100,
            avgCost: Math.round(avgCost * 100) / 100,
            avgSaleRate: Math.round(avgSaleRate * 100) / 100,
            revenue: Math.round(sales.revenue * 100) / 100,
            cogs: Math.round(cogs * 100) / 100,
            profit: Math.round(profit * 100) / 100,
            marginPct: Math.round(marginPct * 10) / 10,
          };
        })
        .filter((r) => r.qtySold > 0); // only show products that have been sold

      return rows;
    },
    enabled: isDealerAdmin,
  });

  if (!isDealerAdmin) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Profit analysis is only available to owners.
        </CardContent>
      </Card>
    );
  }

  const rows = (data ?? [])
    .filter(
      (r) =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.sku.toLowerCase().includes(search.toLowerCase()) ||
        r.brand.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "margin") return b.marginPct - a.marginPct;
      if (sortBy === "revenue") return b.revenue - a.revenue;
      return b.profit - a.profit;
    });

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCogs = rows.reduce((s, r) => s + r.cogs, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-lg font-bold text-foreground">৳{Math.round(totalRevenue).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total COGS</p>
            <p className="text-lg font-bold text-muted-foreground">৳{Math.round(totalCogs).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Profit</p>
            <p className={`text-lg font-bold ${totalProfit >= 0 ? "text-primary" : "text-destructive"}`}>
              ৳{Math.round(totalProfit).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Overall Margin</p>
            <p className={`text-lg font-bold ${overallMargin >= 0 ? "text-primary" : "text-destructive"}`}>
              {overallMargin.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Search product, SKU, brand..."
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="profit">Highest Profit</SelectItem>
            <SelectItem value="margin">Highest Margin</SelectItem>
            <SelectItem value="revenue">Highest Revenue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Avg Cost</TableHead>
                  <TableHead className="text-right">Avg Sale Rate</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No sales data found</TableCell></TableRow>
                ) : (
                  <>
                    {rows.map((r) => (
                      <TableRow key={r.id} className={r.profit < 0 ? "bg-destructive/5" : ""}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{r.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{r.sku}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{r.brand}</TableCell>
                        <TableCell className="text-right">{r.qtySold}</TableCell>
                        <TableCell className="text-right text-muted-foreground">৳{r.avgCost.toLocaleString()}</TableCell>
                        <TableCell className="text-right">৳{r.avgSaleRate.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium">৳{r.revenue.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-muted-foreground">৳{r.cogs.toLocaleString()}</TableCell>
                        <TableCell className={`text-right font-bold ${r.profit >= 0 ? "text-primary" : "text-destructive"}`}>
                          ৳{r.profit.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={r.marginPct >= 20 ? "default" : r.marginPct >= 0 ? "secondary" : "destructive"}
                            className="text-xs"
                          >
                            {r.marginPct.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals */}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={3}>Total ({rows.length} products)</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right">৳{Math.round(totalRevenue).toLocaleString()}</TableCell>
                      <TableCell className="text-right">৳{Math.round(totalCogs).toLocaleString()}</TableCell>
                      <TableCell className={`text-right ${totalProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                        ৳{Math.round(totalProfit).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">{overallMargin.toFixed(1)}%</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ReportsPageContent;
