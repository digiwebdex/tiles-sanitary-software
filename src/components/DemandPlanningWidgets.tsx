import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Package, TrendingUp, TrendingDown, Truck, Archive } from "lucide-react";
import { demandPlanningService } from "@/services/demandPlanningService";
import { formatCurrency } from "@/lib/utils";

interface Props { dealerId: string }

/**
 * Compact owner dashboard widgets for Demand Planning / Reorder Intelligence.
 * Read-only and advisory. Hidden if there is no inventory at all.
 */
export function DemandPlanningWidgets({ dealerId }: Props) {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["demand-planning-dashboard", dealerId],
    queryFn: () => demandPlanningService.getDashboardStats(dealerId),
    enabled: !!dealerId,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  if (!stats) return null;

  // Hide entirely if no relevant signals
  const total =
    stats.reorderNeededCount + stats.lowStockCount + stats.stockoutRiskCount +
    stats.deadStockCount + stats.fastMovingCount + stats.incomingCoverageProductCount;
  if (total === 0) return null;

  const goReports = () => navigate("/reports");

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
        Demand Planning
      </h2>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={goReports}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Reorder Needed
            </CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{stats.reorderNeededCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Products to reorder</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors border-destructive/30"
          onClick={goReports}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Stockout Risk
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-destructive">{stats.stockoutRiskCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Less than 7 days cover</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={goReports}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Low Stock
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-amber-700">{stats.lowStockCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">At or below reorder level</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={goReports}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Dead Stock
            </CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{stats.deadStockCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatCurrency(stats.deadStockValue)} value
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors border-emerald-300/50"
          onClick={goReports}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Fast Moving
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-emerald-700">{stats.fastMovingCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">≥ 20 units in last 30 days</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={goReports}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Incoming Coverage
            </CardTitle>
            <Truck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{stats.incomingCoverageProductCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Products with inflow 30d</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
