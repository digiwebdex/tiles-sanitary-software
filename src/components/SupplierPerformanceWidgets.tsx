import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, AlertTriangle, Wallet, Clock, TrendingDown } from "lucide-react";
import { supplierPerformanceService } from "@/services/supplierPerformanceService";
import { formatCurrency } from "@/lib/utils";

interface Props {
  dealerId: string;
}

/**
 * Compact dashboard widgets for supplier performance.
 * Hidden if there's no purchase activity at all.
 */
export function SupplierPerformanceWidgets({ dealerId }: Props) {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["supplier-performance-dashboard", dealerId],
    queryFn: () => supplierPerformanceService.getDashboardStats(dealerId),
    enabled: !!dealerId,
    refetchInterval: 120_000,
  });

  if (!stats) return null;
  if (stats.activeSuppliers === 0) return null;

  const goReports = () => navigate("/reports");

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
        Supplier Performance
      </h2>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors border-emerald-300/50"
          onClick={goReports}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Reliable Suppliers
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-emerald-700">{stats.reliableCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Score ≥ 80, recently active</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors border-destructive/30"
          onClick={goReports}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              At-Risk Suppliers
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-destructive">{stats.atRiskCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">High return / inactivity</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={goReports}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Delayed Suppliers
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-amber-700">{stats.delayedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">No purchase in 90+ days</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors border-destructive/30"
          onClick={goReports}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              High Return Rate
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-destructive">{stats.highReturnCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Return rate ≥ 5%</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors border-amber-300/50"
          onClick={goReports}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Outstanding
            </CardTitle>
            <Wallet className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-amber-700">
              {formatCurrency(stats.totalOutstanding)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Across {stats.highOutstanding.length} supplier{stats.highOutstanding.length === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default SupplierPerformanceWidgets;
