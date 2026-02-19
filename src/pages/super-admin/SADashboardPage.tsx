import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, CalendarPlus, AlertTriangle, IndianRupee, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const PIE_COLORS = ["hsl(222.2, 47.4%, 11.2%)", "hsl(0, 84.2%, 60.2%)", "hsl(210, 40%, 70%)"];

const StatCard = ({ title, value, icon: Icon, description }: { title: string; value: string | number; icon: any; description?: string }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </CardContent>
  </Card>
);

const SADashboardPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["sa-dashboard-full"],
    queryFn: async () => {
      const [dealersRes, subsRes, plansRes] = await Promise.all([
        supabase.from("dealers").select("id, status"),
        supabase.from("subscriptions").select("id, status, start_date, end_date, plan_id, dealer_id, plans(price_monthly, price_yearly)"),
        supabase.from("plans").select("id, price_monthly, price_yearly"),
      ]);

      if (dealersRes.error) throw new Error(dealersRes.error.message);
      if (subsRes.error) throw new Error(subsRes.error.message);

      const dealers = dealersRes.data ?? [];
      const subs = subsRes.data ?? [];

      const totalDealers = dealers.length;
      const activeSubs = subs.filter((s: any) => s.status === "active").length;
      const expiredSubs = subs.filter((s: any) => s.status === "expired").length;
      const suspendedSubs = subs.filter((s: any) => s.status === "suspended").length;

      // Monthly revenue = sum of price_monthly for active subs
      const monthlyRevenue = subs
        .filter((s: any) => s.status === "active")
        .reduce((sum: number, s: any) => sum + (Number(s.plans?.price_monthly) || 0), 0);

      // Total revenue = sum of price_monthly × months active for all subs
      let totalRevenue = 0;
      subs.forEach((s: any) => {
        const monthly = Number(s.plans?.price_monthly) || 0;
        if (monthly > 0 && s.start_date) {
          const start = new Date(s.start_date);
          const end = s.end_date ? new Date(s.end_date) : new Date();
          const months = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)));
          totalRevenue += monthly * months;
        }
      });

      // Monthly revenue chart (last 6 months)
      const now = new Date();
      const monthlyChart: { month: string; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthLabel = d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);

        let rev = 0;
        subs.forEach((s: any) => {
          const sStart = new Date(s.start_date);
          const sEnd = s.end_date ? new Date(s.end_date) : new Date("2099-12-31");
          const monthly = Number(s.plans?.price_monthly) || 0;
          // Sub was active during this month?
          if (sStart <= monthEnd && sEnd >= monthStart && monthly > 0) {
            rev += monthly;
          }
        });
        monthlyChart.push({ month: monthLabel, revenue: rev });
      }

      // Pie chart data
      const pieData = [
        { name: "Active", value: activeSubs },
        { name: "Expired", value: expiredSubs },
        ...(suspendedSubs > 0 ? [{ name: "Suspended", value: suspendedSubs }] : []),
      ].filter((d) => d.value > 0);

      return {
        totalDealers,
        activeSubs,
        expiredSubs,
        monthlyRevenue,
        totalRevenue,
        monthlyChart,
        pieData,
      };
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading dashboard…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">System-wide overview of your SaaS ERP platform.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <StatCard title="Total Dealers" value={data?.totalDealers ?? 0} icon={Store} />
        <StatCard title="Active Subscriptions" value={data?.activeSubs ?? 0} icon={CalendarPlus} />
        <StatCard title="Expired Subscriptions" value={data?.expiredSubs ?? 0} icon={AlertTriangle} />
        <StatCard
          title="Monthly Revenue"
          value={`₹${(data?.monthlyRevenue ?? 0).toLocaleString("en-IN")}`}
          icon={IndianRupee}
          description="Current MRR"
        />
        <StatCard
          title="Total Revenue"
          value={`₹${(data?.totalRevenue ?? 0).toLocaleString("en-IN")}`}
          icon={TrendingUp}
          description="Estimated lifetime"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Monthly Revenue (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.monthlyChart ?? []} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(215.4, 16.3%, 46.9%)", fontSize: 12 }} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(215.4, 16.3%, 46.9%)", fontSize: 12 }} tickFormatter={(v) => `₹${v.toLocaleString("en-IN")}`} />
                  <Tooltip
                    formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, "Revenue"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(214.3, 31.8%, 91.4%)", fontSize: 13 }}
                  />
                  <Bar dataKey="revenue" fill="hsl(222.2, 47.4%, 11.2%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscription Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {(data?.pieData?.length ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data?.pieData}
                      cx="50%"
                      cy="45%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={false}
                    >
                      {data?.pieData?.map((_: any, idx: number) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number, name: string) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SADashboardPage;
