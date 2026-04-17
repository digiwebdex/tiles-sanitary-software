import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonitorSpeaker, Send, AlertTriangle, Clock } from "lucide-react";
import { sampleIssueService } from "@/services/displayStockService";

interface Props {
  dealerId: string;
}

export function DisplaySampleDashboardWidgets({ dealerId }: Props) {
  const { data } = useQuery({
    queryKey: ["display-sample-stats", dealerId],
    queryFn: () => sampleIssueService.getDashboardStats(dealerId),
    enabled: !!dealerId,
    refetchInterval: 60_000,
  });

  const stats = data ?? {
    outstandingSamples: 0,
    totalDisplayQty: 0,
    damagedLostCount: 0,
    oldestOutstandingDays: 0,
    oldestOutstandingDate: null as string | null,
  };

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
        Display & Samples
      </h2>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Display Items</CardTitle>
            <MonitorSpeaker className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{stats.totalDisplayQty.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Units on showroom display</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Pending Returns</CardTitle>
            <Send className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{stats.outstandingSamples}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Samples awaiting return</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Damaged / Lost</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{stats.damagedLostCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Samples written off</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Oldest Outstanding</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">
              {stats.oldestOutstandingDays > 0 ? `${stats.oldestOutstandingDays}d` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.oldestOutstandingDate ?? "No pending samples"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
