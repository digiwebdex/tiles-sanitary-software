import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Package, TrendingUp, Truck, Archive, Layers } from "lucide-react";
import { demandPlanningService } from "@/services/demandPlanningService";
import { demandPlanningSettingsService } from "@/services/demandPlanningSettingsService";
import { formatCurrency } from "@/lib/utils";

interface Props { dealerId: string }

/**
 * Compact owner dashboard widgets for Demand Planning / Reorder Intelligence.
 * Read-only, advisory. Hidden if there are no relevant signals at all.
 * Threshold copy reflects live dealer settings.
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

  const { data: settings } = useQuery({
    queryKey: ["demand-planning-settings", dealerId],
    queryFn: () => demandPlanningSettingsService.get(dealerId),
    enabled: !!dealerId,
    staleTime: 60_000,
  });

  if (!stats) return null;

  const total =
    stats.reorderNeededCount + stats.lowStockCount + stats.stockoutRiskCount +
    stats.deadStockCount + stats.fastMovingCount + stats.incomingCoverageProductCount;
  if (total === 0) return null;

  const goReports = () => navigate("/reports");

  const stockoutDays = settings?.stockout_cover_days ?? 7;
  const fastQty = settings?.fast_moving_30d_qty ?? 20;
  const incomingDays = settings?.incoming_window_days ?? 30;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
        Demand Planning
      </h2>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={goReports}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Reorder Needed</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{stats.reorderNeededCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Products to reorder</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors border-destructive/30" onClick={goReports}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Stockout Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-destructive">{stats.stockoutRiskCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Less than {stockoutDays} days cover</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={goReports}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-amber-700">{stats.lowStockCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">At or below reorder + safety</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={goReports}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Dead Stock</CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{stats.deadStockCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(stats.deadStockValue)} value</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors border-emerald-300/50" onClick={goReports}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Fast Moving</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-emerald-700">{stats.fastMovingCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">≥ {fastQty} units in last 30 days</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={goReports}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Incoming Coverage</CardTitle>
            <Truck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{stats.incomingCoverageProductCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Inflow {incomingDays}d ·{" "}
              {stats.uncoveredGapCount > 0
                ? <span className="text-destructive font-medium">{stats.uncoveredGapCount} uncovered</span>
                : <span>fully covered</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      {(stats.topCategoriesAtRisk.length > 0 || stats.topBrandsAtRisk.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Where the risk concentrates
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-semibold text-muted-foreground mb-1">Top categories at risk</p>
              {stats.topCategoriesAtRisk.length === 0 ? (
                <p className="text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-1">
                  {stats.topCategoriesAtRisk.map((c) => (
                    <li key={c.key} className="flex justify-between">
                      <span>{c.key}</span>
                      <span className="font-medium">{c.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="font-semibold text-muted-foreground mb-1">Top brands at risk</p>
              {stats.topBrandsAtRisk.length === 0 ? (
                <p className="text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-1">
                  {stats.topBrandsAtRisk.map((b) => (
                    <li key={b.key} className="flex justify-between">
                      <span>{b.key}</span>
                      <span className="font-medium">{b.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
