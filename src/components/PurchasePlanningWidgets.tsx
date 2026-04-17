import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, AlertTriangle, ShoppingCart, Calendar, Folder, MapPin } from "lucide-react";
import { purchasePlanningService } from "@/services/purchasePlanningService";

interface Props { dealerId: string }

/**
 * Owner Dashboard — Purchase Planning widgets.
 * Click-through navigates to Reports → Purchase Planning.
 */
export function PurchasePlanningWidgets({ dealerId }: Props) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["purchase-planning-dashboard", dealerId],
    queryFn: () => purchasePlanningService.dashboardStats(dealerId),
    enabled: !!dealerId,
    refetchInterval: 120_000,
  });

  if (!data) return null;

  const goToReport = () => navigate("/reports?report=purchase-need");
  const goToProjectReport = () => navigate("/reports?report=purchase-project-site");

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
        Purchase Planning
      </h2>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={goToReport}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Open Shortages</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-foreground">{data.openCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">unplanned lines</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={goToReport}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Planned Need</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-foreground">{data.plannedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">linked to purchase</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={goToReport}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Customers Waiting</CardTitle>
            <ShoppingCart className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-foreground">{data.totalCustomersWaiting}</p>
            <p className="text-xs text-muted-foreground mt-0.5">distinct buyers</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={goToReport}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Oldest Demand</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-sm font-semibold text-foreground">{data.oldestDemandDate ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">awaiting purchase</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {data.topProducts.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top Shortage Products</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1.5">
                {data.topProducts.map((p) => (
                  <div
                    key={p.product_id}
                    className="flex items-center justify-between gap-3 text-sm p-2 rounded hover:bg-muted/50 cursor-pointer"
                    onClick={goToReport}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">({p.sku})</span>
                    </div>
                    <Badge className="bg-amber-500/10 text-amber-700 border-amber-300 shrink-0">
                      {p.shortage_qty} {p.unit_type === "box_sft" ? "box" : "pc"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {data.topProjects.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top Waiting Projects / Sites</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1.5">
                {data.topProjects.map((p) => (
                  <div
                    key={p.key}
                    className="flex items-center justify-between gap-3 text-sm p-2 rounded hover:bg-muted/50 cursor-pointer"
                    onClick={goToProjectReport}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        {p.project_id ? (
                          <Folder className="h-3 w-3 text-primary shrink-0" />
                        ) : (
                          <ShoppingCart className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-medium truncate">{p.project_name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate ml-4">
                        {p.site_name && (
                          <span className="inline-flex items-center gap-1 mr-2">
                            <MapPin className="h-3 w-3" />
                            {p.site_name}
                          </span>
                        )}
                        {p.customer_name}
                      </div>
                    </div>
                    <Badge className="bg-amber-500/10 text-amber-700 border-amber-300 shrink-0">
                      {p.shortage_qty}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
