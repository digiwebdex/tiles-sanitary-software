import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import {
  IndianRupee, TrendingUp, Package, AlertTriangle, Receipt,
} from "lucide-react";

interface OwnerDashboardProps {
  dealerId: string;
}

const PIE_COLORS = [
  "hsl(222.2, 47.4%, 11.2%)",   // primary
  "hsl(215.4, 16.3%, 46.9%)",   // muted-foreground
  "hsl(210, 40%, 96.1%)",       // secondary
  "hsl(0, 84.2%, 60.2%)",       // destructive
  "hsl(210, 40%, 70%)",
  "hsl(180, 30%, 50%)",
];

const barChartConfig = {
  amount: { label: "Sales (₹)", color: "hsl(var(--primary))" },
};

const OwnerDashboard = ({ dealerId }: OwnerDashboardProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["owner-dashboard", dealerId],
    queryFn: () => dashboardService.getData(dealerId),
    enabled: !!dealerId,
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return <p className="text-muted-foreground p-6">Loading dashboard…</p>;
  }

  const summaryCards = [
    {
      title: "Today Sales",
      value: `₹${data.todaySales.toLocaleString("en-IN")}`,
      icon: IndianRupee,
      accent: "text-primary",
    },
    {
      title: "Monthly Sales",
      value: `₹${data.monthlySales.toLocaleString("en-IN")}`,
      icon: TrendingUp,
      accent: "text-primary",
    },
    {
      title: "Monthly Profit",
      value: `₹${data.monthlyProfit.toLocaleString("en-IN")}`,
      icon: TrendingUp,
      accent: data.monthlyProfit >= 0 ? "text-primary" : "text-destructive",
    },
    {
      title: "Stock Value",
      value: `₹${data.totalStockValue.toLocaleString("en-IN")}`,
      icon: Package,
      accent: "text-primary",
    },
    {
      title: "Total Due",
      value: `₹${data.totalDue.toLocaleString("en-IN")}`,
      icon: Receipt,
      accent: data.totalDue > 0 ? "text-destructive" : "text-primary",
    },
    {
      title: "Low Stock Items",
      value: String(data.lowStockItems.length),
      icon: AlertTriangle,
      accent: data.lowStockItems.length > 0 ? "text-destructive" : "text-primary",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {c.title}
              </CardTitle>
              <c.icon className={`h-4 w-4 ${c.accent}`} />
            </CardHeader>
            <CardContent>
              <p className={`text-lg font-bold ${c.accent}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly Sales Bar Chart */}
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
                <Bar
                  dataKey="amount"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Category-wise Sales Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales by Category</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {data.categorySales.length === 0 ? (
              <p className="text-muted-foreground text-sm">No data</p>
            ) : (
              <div className="w-full">
                <ResponsiveContainer width="100%" height={250}>
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
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap gap-3 justify-center">
                  {data.categorySales.map((c, i) => (
                    <div key={c.category} className="flex items-center gap-1.5 text-xs">
                      <div
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-muted-foreground">{c.category}</span>
                      <span className="font-medium">₹{c.amount.toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Items Table */}
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
                        <Badge variant="outline" className="capitalize text-xs">
                          {item.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-destructive font-semibold">
                        {item.currentQty}
                      </TableCell>
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
