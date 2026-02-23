import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { dashboardService } from "@/services/dashboardService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, Package, AlertTriangle, Receipt, Banknote,
  ShoppingCart, Wallet, Users, CreditCard, Clock, BarChart2, Layers, Truck,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";

interface OwnerDashboardProps {
  dealerId: string;
}

const PIE_COLORS = [
  "hsl(222.2, 47.4%, 11.2%)",
  "hsl(215.4, 16.3%, 46.9%)",
  "hsl(210, 40%, 96.1%)",
  "hsl(0, 84.2%, 60.2%)",
  "hsl(210, 40%, 70%)",
  "hsl(180, 30%, 50%)",
];

const barChartConfig = {
  amount: { label: "Sales (৳)", color: "hsl(var(--primary))" },
};

interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  iconClass?: string;
  valueClass?: string;
  sub?: string;
}

const KpiCard = ({ title, value, icon: Icon, iconClass = "text-primary", valueClass = "text-foreground", sub }: KpiCardProps) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
      <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      <Icon className={`h-4 w-4 ${iconClass}`} />
    </CardHeader>
    <CardContent>
      <p className={`text-lg font-bold ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </CardContent>
  </Card>
);

interface SectionProps {
  title: string;
  children: React.ReactNode;
  cols?: string;
}

const Section = ({ title, children, cols = "grid-cols-2 md:grid-cols-4" }: SectionProps) => (
  <div className="space-y-3">
    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-0.5">{title}</h2>
    <div className={`grid gap-4 ${cols}`}>
      {children}
    </div>
  </div>
);

const OwnerDashboard = ({ dealerId }: OwnerDashboardProps) => {
  const { isDealerAdmin } = useAuth();
  const navigate = useNavigate();
  const [latestTab, setLatestTab] = useState("sales");
  
  const { data, isLoading, isError } = useQuery({
    queryKey: ["owner-dashboard", dealerId],
    queryFn: () => dashboardService.getData(dealerId),
    enabled: !!dealerId,
    refetchInterval: 60_000,
    retry: 2,
  });

  // Latest Five queries
  const { data: latestSales } = useQuery({
    queryKey: ["latest-sales", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, sale_date, invoice_number, total_amount, paid_amount, due_amount, sale_status, customers(name)")
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!dealerId,
  });

  const { data: latestPurchases } = useQuery({
    queryKey: ["latest-purchases", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchases")
        .select("id, purchase_date, invoice_number, total_amount, suppliers(name)")
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!dealerId,
  });

  const { data: latestCustomers } = useQuery({
    queryKey: ["latest-customers", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, type, created_at")
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!dealerId,
  });

  const { data: latestSuppliers } = useQuery({
    queryKey: ["latest-suppliers", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name, phone, status, created_at")
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!dealerId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-3">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="h-24 bg-muted rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-muted-foreground p-6">
        Dashboard data unavailable. Please refresh the page.
      </p>
    );
  }

  const totalAlerts = data.overdueCustomerCount + data.creditExceededCount + data.lowStockItems.length + data.deadStockCount;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        {totalAlerts > 0 && (
          <Badge variant="destructive" className="gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            {totalAlerts} Alert{totalAlerts !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* ── Quick Links ── */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        {[
          { label: "Products", icon: Package, path: "/products" },
          { label: "Sales", icon: Receipt, path: "/sales" },
          { label: "Purchases", icon: ShoppingCart, path: "/purchases" },
          { label: "Customers", icon: Users, path: "/customers" },
          { label: "Suppliers", icon: Truck, path: "/suppliers" },
        ].map((link) => (
          <Card
            key={link.path}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => navigate(link.path)}
          >
            <CardContent className="flex flex-col items-center gap-2 py-4 px-2">
              <link.icon className="h-6 w-6 text-primary" />
              <span className="text-xs font-medium text-foreground">{link.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Latest Five ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Latest Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={latestTab} onValueChange={setLatestTab}>
            <TabsList className="mb-3">
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="purchases">Purchases</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
              <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            </TabsList>

            <TabsContent value="sales">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(latestSales ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No sales yet</TableCell></TableRow>
                    ) : (latestSales ?? []).map((s: any) => (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/sales/${s.id}/invoice`)}>
                        <TableCell>{s.sale_date}</TableCell>
                        <TableCell className="font-mono text-sm">{s.invoice_number ?? "—"}</TableCell>
                        <TableCell>{s.customers?.name ?? "—"}</TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize text-xs">{s.sale_status}</Badge></TableCell>
                        <TableCell className="text-right">{formatCurrency(s.total_amount)}</TableCell>
                        <TableCell className={`text-right ${Number(s.due_amount) > 0 ? "text-destructive font-semibold" : ""}`}>
                          {formatCurrency(s.due_amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="purchases">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(latestPurchases ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No purchases yet</TableCell></TableRow>
                    ) : (latestPurchases ?? []).map((p: any) => (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/purchases/${p.id}`)}>
                        <TableCell>{p.purchase_date}</TableCell>
                        <TableCell className="font-mono text-sm">{p.invoice_number ?? "—"}</TableCell>
                        <TableCell>{p.suppliers?.name ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(p.total_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="customers">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(latestCustomers ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No customers yet</TableCell></TableRow>
                    ) : (latestCustomers ?? []).map((c: any) => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/customers/${c.id}/edit`)}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.phone ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize text-xs">{c.type}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="suppliers">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(latestSuppliers ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No suppliers yet</TableCell></TableRow>
                    ) : (latestSuppliers ?? []).map((s: any) => (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/suppliers/${s.id}/edit`)}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.phone ?? "—"}</TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize text-xs">{s.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Section 1: Today ── */}
      <Section title="Today">
        <KpiCard
          title="Sales"
          value={formatCurrency(data.todaySales)}
          icon={Banknote}
          iconClass="text-primary"
        />
        <KpiCard
          title="Collection"
          value={formatCurrency(data.todayCollection)}
          icon={Wallet}
          iconClass="text-primary"
        />
        {isDealerAdmin && (
          <KpiCard
            title="Profit"
            value={formatCurrency(data.todayProfit)}
            icon={TrendingUp}
            iconClass={data.todayProfit >= 0 ? "text-primary" : "text-destructive"}
            valueClass={data.todayProfit >= 0 ? "text-foreground" : "text-destructive"}
          />
        )}
        <KpiCard
          title="SFT Sold"
          value={`${data.todaySftSold.toLocaleString()} sft`}
          icon={BarChart2}
          iconClass="text-primary"
        />
      </Section>

      {/* ── Section 2: This Month ── */}
      <Section title="This Month">
        <KpiCard
          title="Total Sales"
          value={formatCurrency(data.monthlySales)}
          icon={ShoppingCart}
          iconClass="text-primary"
        />
        <KpiCard
          title="Total Collection"
          value={formatCurrency(data.monthlyCollection)}
          icon={Wallet}
          iconClass="text-primary"
        />
        {isDealerAdmin && (
          <KpiCard
            title="Total Profit"
            value={formatCurrency(data.monthlyProfit)}
            icon={TrendingUp}
            iconClass={data.monthlyProfit >= 0 ? "text-primary" : "text-destructive"}
            valueClass={data.monthlyProfit >= 0 ? "text-foreground" : "text-destructive"}
          />
        )}
        <KpiCard
          title="Total Purchase"
          value={formatCurrency(data.monthlyPurchase)}
          icon={Package}
          iconClass="text-muted-foreground"
        />
      </Section>

      {/* ── Section 3: Financial Summary ── */}
      <Section title="Financial Summary">
        <KpiCard
          title="Total Receivable"
          value={formatCurrency(data.totalCustomerDue)}
          icon={Receipt}
          iconClass={data.totalCustomerDue > 0 ? "text-destructive" : "text-primary"}
          valueClass={data.totalCustomerDue > 0 ? "text-destructive" : "text-foreground"}
          sub="Customer outstanding"
        />
        <KpiCard
          title="Total Payable"
          value={formatCurrency(data.totalSupplierPayable)}
          icon={CreditCard}
          iconClass={data.totalSupplierPayable > 0 ? "text-destructive" : "text-primary"}
          valueClass={data.totalSupplierPayable > 0 ? "text-destructive" : "text-foreground"}
          sub="Supplier outstanding"
        />
        <KpiCard
          title="Cash in Hand"
          value={formatCurrency(data.cashInHand)}
          icon={Banknote}
          iconClass="text-primary"
          sub="From cash ledger"
        />
        <KpiCard
          title="Inventory Value"
          value={formatCurrency(data.totalStockValue)}
          icon={Layers}
          iconClass="text-primary"
          sub="At avg purchase rate"
        />
      </Section>

      {/* ── Section 4: Alerts ── */}
      {totalAlerts > 0 && (
        <Section title="Alerts">
          {data.overdueCustomerCount > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Overdue Customers</CardTitle>
                <Clock className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-destructive">{data.overdueCustomerCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Exceeded payment deadline</p>
              </CardContent>
            </Card>
          )}
          {data.creditExceededCount > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Credit Limit Exceeded</CardTitle>
                <CreditCard className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-destructive">{data.creditExceededCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Over their credit limit</p>
              </CardContent>
            </Card>
          )}
          {data.lowStockItems.length > 0 && (
            <Card className="border-yellow-500/40 bg-yellow-50/50 dark:bg-yellow-900/10">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Low Stock Warning</CardTitle>
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{data.lowStockItems.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Below reorder level</p>
              </CardContent>
            </Card>
          )}
          {data.deadStockCount > 0 && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Dead Stock Alert</CardTitle>
                <Package className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-destructive">{data.deadStockCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">No movement in 90 days</p>
              </CardContent>
            </Card>
          )}
        </Section>
      )}

      {/* ── Charts Row ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Monthly Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={barChartConfig} className="h-[300px] w-full">
              <BarChart data={data.monthlySalesChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales by Category</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {data.categorySales.length === 0 ? (
              <p className="text-muted-foreground text-sm">No data</p>
            ) : (
              <div className="w-full">
                <ChartContainer
                  config={Object.fromEntries(
                    data.categorySales.map((c, i) => [c.category, { label: c.category, color: PIE_COLORS[i % PIE_COLORS.length] }])
                  )}
                  className="h-[250px] w-full"
                >
                  <PieChart>
                    <Pie
                      data={data.categorySales}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="amount"
                      nameKey="category"
                      label={({ category }) => category}
                    >
                      {data.categorySales.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent nameKey="category" />} />
                  </PieChart>
                </ChartContainer>
                <div className="mt-2 flex flex-wrap gap-3 justify-center">
                  {data.categorySales.map((c, i) => (
                    <div key={c.category} className="flex items-center gap-1.5 text-xs">
                      <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted-foreground">{c.category}</span>
                      <span className="font-medium">{formatCurrency(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Low Stock Items Table ── */}
      {data.lowStockItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Low Stock Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Current Qty</TableHead>
                    <TableHead className="text-right">Reorder Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lowStockItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">{item.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-destructive font-semibold">{item.currentQty}</TableCell>
                      <TableCell className="text-right">{item.reorderLevel}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OwnerDashboard;
