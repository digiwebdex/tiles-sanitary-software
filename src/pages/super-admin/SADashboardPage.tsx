import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Store, CalendarPlus, AlertTriangle, TrendingUp,
  Clock, Ban, Wallet, Banknote,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { differenceInDays, parseISO, startOfMonth, endOfMonth, format } from "date-fns";

const PIE_COLORS = ["hsl(222.2, 47.4%, 11.2%)", "hsl(0, 84.2%, 60.2%)", "hsl(210, 40%, 70%)", "hsl(48, 96%, 53%)"];
const GRACE_DAYS = 3;

const StatCard = ({
  title, value, icon: Icon, description, badge,
}: {
  title: string; value: string | number; icon: any; description?: string;
  badge?: { label: string; variant: "default" | "destructive" | "secondary" | "outline"; className?: string };
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {badge && (
          <Badge variant={badge.variant} className={`text-xs ${badge.className ?? ""}`}>
            {badge.label}
          </Badge>
        )}
      </div>
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </CardContent>
  </Card>
);

const SADashboardPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["sa-dashboard-full"],
    queryFn: async () => {
      const [dealersRes, subsRes, paymentsRes] = await Promise.all([
        supabase.from("dealers").select("id, status"),
        supabase.from("subscriptions").select("id, status, start_date, end_date, plan_id, dealer_id, subscription_plans!subscriptions_plan_id_fkey(monthly_price, yearly_price)"),
        supabase.from("subscription_payments").select("id, amount, payment_date, payment_status"),
      ]);

      if (dealersRes.error) throw new Error(dealersRes.error.message);
      if (subsRes.error) throw new Error(subsRes.error.message);

      const dealers = dealersRes.data ?? [];
      const subs = subsRes.data ?? [];
      const payments = paymentsRes.data ?? [];

      const totalDealers = dealers.length;
      const activeSubs = subs.filter((s: any) => s.status === "active").length;
      const expiredSubs = subs.filter((s: any) => s.status === "expired").length;
      const suspendedSubs = subs.filter((s: any) => s.status === "suspended").length;

      // Grace period dealers: expired but within 3 days
      const now = new Date();
      const graceDealers = subs.filter((s: any) => {
        if (s.status !== "expired" || !s.end_date) return false;
        const daysSince = differenceInDays(now, parseISO(s.end_date));
        return daysSince >= 0 && daysSince <= GRACE_DAYS;
      }).length;

      // Expiring soon: active subs with end_date within 7 days
      const expiringSoon = subs.filter((s: any) => {
        if (s.status !== "active" || !s.end_date) return false;
        const daysLeft = differenceInDays(parseISO(s.end_date), now);
        return daysLeft >= 0 && daysLeft <= 7;
      }).length;

      // True expired (past grace)
      const trueExpired = subs.filter((s: any) => {
        if (s.status !== "expired") return false;
        if (!s.end_date) return true;
        const daysSince = differenceInDays(now, parseISO(s.end_date));
        return daysSince > GRACE_DAYS;
      }).length;

      // MRR
      const monthlyRevenue = subs
        .filter((s: any) => s.status === "active")
        .reduce((sum: number, s: any) => sum + (Number(s.subscription_plans?.monthly_price) || 0), 0);

      // This month collected revenue from subscription_payments
      const thisMonthStart = startOfMonth(now);
      const thisMonthEnd = endOfMonth(now);
      const thisMonthCollected = payments
        .filter((p: any) =>
          (p.payment_status === "paid" || p.payment_status === "partial") &&
          p.payment_date &&
          parseISO(p.payment_date) >= thisMonthStart &&
          parseISO(p.payment_date) <= thisMonthEnd
        )
        .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

      // Outstanding = pending payments total
      const totalOutstanding = payments
        .filter((p: any) => p.payment_status === "pending" || p.payment_status === "partial")
        .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

      // Monthly revenue trend chart (last 6 months)
      const monthlyChart: { month: string; expected: number; collected: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthLabel = format(d, "MMM yy");
        const mStart = startOfMonth(d);
        const mEnd = endOfMonth(d);

        let expected = 0;
        subs.forEach((s: any) => {
          const sStart = new Date(s.start_date);
          const sEnd = s.end_date ? new Date(s.end_date) : new Date("2099-12-31");
          const monthly = Number(s.plans?.price_monthly) || 0;
          if (sStart <= mEnd && sEnd >= mStart && monthly > 0) {
            expected += monthly;
          }
        });

        const collected = payments
          .filter((p: any) =>
            (p.payment_status === "paid" || p.payment_status === "partial") &&
            p.payment_date &&
            parseISO(p.payment_date) >= mStart &&
            parseISO(p.payment_date) <= mEnd
          )
          .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

        monthlyChart.push({ month: monthLabel, expected, collected });
      }

      // Pie chart data
      const pieData = [
        { name: "Active", value: activeSubs },
        { name: "Expiring Soon", value: expiringSoon },
        { name: "Expired", value: trueExpired },
        { name: "Grace", value: graceDealers },
        ...(suspendedSubs > 0 ? [{ name: "Suspended", value: suspendedSubs }] : []),
      ].filter((d) => d.value > 0);

      return {
        totalDealers,
        activeSubs,
        expiredSubs: trueExpired,
        graceDealers,
        expiringSoon,
        monthlyRevenue,
        thisMonthCollected,
        totalOutstanding,
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

      {/* KPI Cards - Row 1 */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Dealers" value={data?.totalDealers ?? 0} icon={Store} />
        <StatCard title="Active Subscriptions" value={data?.activeSubs ?? 0} icon={CalendarPlus} />
        <StatCard
          title="Monthly Revenue (MRR)"
          value={formatCurrency(data?.monthlyRevenue ?? 0)}
          icon={Banknote}
        />
        <StatCard
          title="This Month Collected"
          value={formatCurrency(data?.thisMonthCollected ?? 0)}
          icon={Wallet}
          description="Payments received this month"
        />
      </div>

      {/* KPI Cards - Row 2 */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Outstanding Revenue"
          value={formatCurrency(data?.totalOutstanding ?? 0)}
          icon={TrendingUp}
          description="Pending + partial payments"
        />
        <StatCard
          title="Expiring Soon"
          value={data?.expiringSoon ?? 0}
          icon={Clock}
          description="Within 7 days"
          badge={
            (data?.expiringSoon ?? 0) > 0
              ? { label: "Action needed", variant: "outline", className: "border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" }
              : undefined
          }
        />
        <StatCard
          title="Grace Period"
          value={data?.graceDealers ?? 0}
          icon={AlertTriangle}
          description="Expired within 3 days"
          badge={
            (data?.graceDealers ?? 0) > 0
              ? { label: "Grace", variant: "outline", className: "border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" }
              : undefined
          }
        />
        <StatCard
          title="Expired Dealers"
          value={data?.expiredSubs ?? 0}
          icon={Ban}
          description="Read-only mode"
          badge={
            (data?.expiredSubs ?? 0) > 0
              ? { label: "Expired", variant: "destructive" }
              : undefined
          }
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Trend Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Monthly Revenue Trend (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.monthlyChart ?? []} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fill: "hsl(215.4, 16.3%, 46.9%)", fontSize: 12 }} />
                  <YAxis tick={{ fill: "hsl(215.4, 16.3%, 46.9%)", fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === "expected" ? "Expected" : "Collected",
                    ]}
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(214.3, 31.8%, 91.4%)", fontSize: 13 }}
                  />
                  <Legend formatter={(v) => (v === "expected" ? "Expected" : "Collected")} />
                  <Bar dataKey="expected" fill="hsl(215.4, 16.3%, 76.9%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" fill="hsl(222.2, 47.4%, 11.2%)" radius={[4, 4, 0, 0]} />
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
