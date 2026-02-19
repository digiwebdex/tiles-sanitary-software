import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TrendingUp, TrendingDown, CalendarClock, Banknote } from "lucide-react";
import {
  format, parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval,
} from "date-fns";
import { formatCurrency } from "@/lib/utils";

interface SubRow {
  id: string;
  dealer_id: string;
  plan_id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  dealers: { name: string } | null;
  plans: { name: string; price_monthly: number; price_yearly: number } | null;
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const d = subMonths(new Date(), i);
  return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") };
});

const SARevenuePage = () => {
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0].value);

  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ["sa-revenue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, dealers(name), plans(name, price_monthly, price_yearly)")
        .order("start_date", { ascending: false });
      if (error) throw new Error(error.message);
      return data as SubRow[];
    },
  });

  const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
  const monthEnd = endOfMonth(monthStart);
  const lastMonthStart = startOfMonth(subMonths(monthStart, 1));
  const lastMonthEnd = endOfMonth(lastMonthStart);

  const isActiveInRange = (sub: SubRow, start: Date, end: Date) => {
    const subStart = parseISO(sub.start_date);
    const subEnd = sub.end_date ? parseISO(sub.end_date) : new Date(2099, 0, 1);
    return subStart <= end && subEnd >= start;
  };

  const thisMonthSubs = useMemo(
    () => subscriptions.filter((s) => isActiveInRange(s, monthStart, monthEnd)),
    [subscriptions, selectedMonth]
  );

  const lastMonthSubs = useMemo(
    () => subscriptions.filter((s) => isActiveInRange(s, lastMonthStart, lastMonthEnd)),
    [subscriptions, selectedMonth]
  );

  const revenueForSubs = (subs: SubRow[]) =>
    subs.reduce((sum, s) => sum + (Number(s.plans?.price_monthly) || 0), 0);

  const thisMonthRevenue = revenueForSubs(thisMonthSubs);
  const lastMonthRevenue = revenueForSubs(lastMonthSubs);

  // Expected renewal: active subs whose end_date falls in next 30 days
  const expectedRenewal = useMemo(() => {
    const now = new Date();
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    return subscriptions
      .filter(
        (s) =>
          s.status === "active" &&
          s.end_date &&
          isWithinInterval(parseISO(s.end_date), { start: now, end: in30 })
      )
      .reduce((sum, s) => sum + (Number(s.plans?.price_monthly) || 0), 0);
  }, [subscriptions]);

  const revDiff = thisMonthRevenue - lastMonthRevenue;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revenue Tracking</h1>
          <p className="text-sm text-muted-foreground">
            Subscription-based revenue overview across all dealers.
          </p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_OPTIONS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month Revenue
            </CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(thisMonthRevenue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {thisMonthSubs.length} subscriptions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last Month Revenue
            </CardTitle>
            {revDiff >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(lastMonthRevenue)}
            </div>
            <p className={`text-xs mt-1 ${revDiff >= 0 ? "text-green-600" : "text-destructive"}`}>
              {revDiff >= 0 ? "+" : ""}{formatCurrency(revDiff)} vs this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expected Renewal
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(expectedRenewal)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Next 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Revenue Breakdown — {MONTH_OPTIONS.find((m) => m.value === selectedMonth)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dealer</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {thisMonthSubs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No revenue records for this month
                      </TableCell>
                    </TableRow>
                  ) : (
                    thisMonthSubs.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">
                          {sub.dealers?.name ?? "—"}
                        </TableCell>
                        <TableCell>{sub.plans?.name ?? "—"}</TableCell>
                        <TableCell className="font-mono">
                          {formatCurrency(sub.plans?.price_monthly ?? 0)}
                        </TableCell>
                        <TableCell className="text-xs">{sub.start_date}</TableCell>
                        <TableCell className="text-xs">{sub.end_date ?? "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              sub.status === "active"
                                ? "default"
                                : sub.status === "expired"
                                ? "destructive"
                                : "secondary"
                            }
                            className="capitalize text-xs"
                          >
                            {sub.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SARevenuePage;
