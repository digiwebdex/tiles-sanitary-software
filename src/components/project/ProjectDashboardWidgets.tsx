import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Folder, MapPin, AlertTriangle, TrendingUp, Activity } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { projectReportService } from "@/services/projectReportService";
import { SiteHistoryDialog } from "@/components/project/SiteHistoryDialog";

interface Props { dealerId: string }

export function ProjectDashboardWidgets({ dealerId }: Props) {
  const navigate = useNavigate();
  const [historySiteId, setHistorySiteId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["project-dashboard-stats", dealerId],
    queryFn: () => projectReportService.dashboardStats(dealerId),
    refetchInterval: 120_000,
  });

  if (!data) return null;
  // Hide widgets entirely if dealer has no project activity
  if (
    data.activeProjectsCount === 0 &&
    data.pendingDeliveriesBySite.length === 0 &&
    data.totalProjectOutstanding === 0 &&
    data.topActive.length === 0 &&
    data.recentSiteActivity.length === 0
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-0.5">Projects &amp; Sites</h2>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/projects")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active Projects</CardTitle>
            <Folder className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-foreground">{data.activeProjectsCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Currently running</p>
          </CardContent>
        </Card>

        <Card className={data.totalProjectOutstanding > 0 ? "border-destructive/30" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Project Outstanding</CardTitle>
            <TrendingUp className={`h-4 w-4 ${data.totalProjectOutstanding > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-lg font-bold ${data.totalProjectOutstanding > 0 ? "text-destructive" : "text-foreground"}`}>
              {formatCurrency(data.totalProjectOutstanding)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Across all projects</p>
          </CardContent>
        </Card>

        <Card className={data.pendingDeliveriesBySite.length > 0 ? "border-orange-500/30" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Sites w/ Pending</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${data.pendingDeliveriesBySite.length > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-foreground">{data.pendingDeliveriesBySite.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.pendingDeliveriesBySite.reduce((s, x) => s + x.pending_count, 0)} pending deliveries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Top Project</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-base font-bold text-foreground truncate">{data.topActive[0]?.project_name ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data.topActive[0] ? formatCurrency(data.topActive[0].total_value) : "No sales yet"}</p>
          </CardContent>
        </Card>
      </div>

      {(data.topActive.length > 0 || data.pendingDeliveriesBySite.length > 0 || data.recentSiteActivity.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.topActive.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Top Active Projects
                  <Badge variant="secondary" className="text-xs">{data.topActive.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.topActive.map((p) => (
                    <div
                      key={p.project_id}
                      className="flex items-center justify-between text-sm rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate("/projects")}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-medium truncate">{p.project_name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">· {p.activity_count} activities</span>
                      </div>
                      <span className="font-semibold shrink-0">{formatCurrency(p.total_value)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data.pendingDeliveriesBySite.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Deliveries Pending by Site
                  <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                    {data.pendingDeliveriesBySite.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.pendingDeliveriesBySite.map((s) => (
                    <div
                      key={s.site_id}
                      className="flex items-center justify-between text-sm rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                      onClick={() => setHistorySiteId(s.site_id)}
                      title="Open site history"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                        <span className="font-medium truncate">{s.site_name}</span>
                        <span className="text-xs text-muted-foreground truncate">· {s.project_name}</span>
                      </div>
                      <Badge variant="outline" className="border-orange-500 text-orange-600 shrink-0">
                        {s.pending_count}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data.recentSiteActivity.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Sites with Recent Activity
                  <Badge variant="secondary" className="text-xs">{data.recentSiteActivity.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.recentSiteActivity.map((s) => (
                    <div
                      key={s.site_id}
                      className="flex items-center justify-between text-sm rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                      onClick={() => setHistorySiteId(s.site_id)}
                      title="Open site history"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Activity className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-medium truncate">{s.site_name}</span>
                        <span className="text-xs text-muted-foreground truncate">· {s.project_name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px] capitalize">{s.kind}</Badge>
                        <span className="text-xs text-muted-foreground">{s.latest_date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <SiteHistoryDialog
        open={!!historySiteId}
        onOpenChange={(o) => { if (!o) setHistorySiteId(null); }}
        dealerId={dealerId}
        siteId={historySiteId}
      />
    </div>
  );
}
