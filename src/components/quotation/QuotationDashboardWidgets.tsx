import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSignature, Clock, CheckCircle, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Props { dealerId: string }

const today = () => new Date().toISOString().split("T")[0];
const daysFromNow = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
};
const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
};

export function QuotationDashboardWidgets({ dealerId }: Props) {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["dashboard-quotations", dealerId],
    queryFn: async () => {
      const [activeRes, expiringRes, convertedRes, allRecentRes] = await Promise.all([
        supabase.from("quotations").select("total_amount").eq("dealer_id", dealerId).eq("status", "active"),
        supabase.from("quotations").select("id, total_amount").eq("dealer_id", dealerId).eq("status", "active").gte("valid_until", today()).lte("valid_until", daysFromNow(7)),
        supabase.from("quotations").select("total_amount").eq("dealer_id", dealerId).eq("status", "converted").gte("converted_at", daysAgo(30) + "T00:00:00"),
        supabase.from("quotations").select("status").eq("dealer_id", dealerId).gte("quote_date", daysAgo(30)),
      ]);
      const activeValue = (activeRes.data ?? []).reduce((s, r: any) => s + Number(r.total_amount), 0);
      const expiringCount = (expiringRes.data ?? []).length;
      const expiringValue = (expiringRes.data ?? []).reduce((s, r: any) => s + Number(r.total_amount), 0);
      const convertedCount = (convertedRes.data ?? []).length;
      const convertedValue = (convertedRes.data ?? []).reduce((s, r: any) => s + Number(r.total_amount), 0);
      const finalized = (allRecentRes.data ?? []).filter((r: any) => r.status !== "draft" && r.status !== "cancelled").length;
      const convertedRecent = (allRecentRes.data ?? []).filter((r: any) => r.status === "converted").length;
      const conversionPct = finalized > 0 ? (convertedRecent / finalized) * 100 : 0;
      return { activeValue, expiringCount, expiringValue, convertedCount, convertedValue, conversionPct };
    },
    enabled: !!dealerId,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-0.5">Quotation Pipeline</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/quotations?status=active")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active Quotes Value</CardTitle>
            <FileSignature className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><p className="text-lg font-bold">{formatCurrency(data?.activeValue ?? 0)}</p></CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/quotations")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Expiring This Week</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{data?.expiringCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(data?.expiringValue ?? 0)}</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/quotations?status=converted")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Converted (30d)</CardTitle>
            <CheckCircle className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{data?.convertedCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(data?.convertedValue ?? 0)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Conversion Rate (30d)</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><p className="text-lg font-bold">{(data?.conversionPct ?? 0).toFixed(1)}%</p></CardContent>
        </Card>
      </div>
    </div>
  );
}
