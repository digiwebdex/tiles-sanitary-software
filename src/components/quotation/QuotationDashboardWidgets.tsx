import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSignature, Clock, CheckCircle, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Props { dealerId: string }

export function QuotationDashboardWidgets({ dealerId }: Props) {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["dashboard-quotations", dealerId],
    queryFn: async () => {
      const res = await vpsAuthedFetch(
        `/api/dashboard/quotation-widgets?dealerId=${dealerId}`,
      );
      const body = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error((body as any)?.error || "Failed to load");
      return {
        activeValue: Number(body.activeValue ?? 0),
        expiringCount: Number(body.expiringCount ?? 0),
        expiringValue: Number(body.expiringValue ?? 0),
        convertedCount: Number(body.convertedCount ?? 0),
        convertedValue: Number(body.convertedValue ?? 0),
        conversionPct: Number(body.conversionPct ?? 0),
      };
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
