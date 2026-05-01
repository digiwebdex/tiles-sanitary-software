import { useQuery } from "@tanstack/react-query";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import DealerUsersOverview from "@/pages/admin/DealerUsersOverview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Server, Users, ShoppingCart, Database, Code, Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const APP_VERSION = "1.0.0";
const APP_START_TIME = new Date();

const SASystemPage = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["sa-system-stats"],
    queryFn: async () => {
      const res = await vpsAuthedFetch("/api/admin/system-stats");
      if (!res.ok) throw new Error(`Failed to load system stats (${res.status})`);
      return (await res.json()) as {
        totalUsers: number;
        totalSales: number;
        totalDealers: number;
        activeSubs: number;
      };
    },
    refetchInterval: 60_000,
  });

  const uptime = formatDistanceToNow(APP_START_TIME, { addSuffix: false });

  const infoItems = [
    {
      icon: Server,
      label: "Server Uptime",
      value: uptime,
      badge: <Badge className="bg-green-600 hover:bg-green-700 text-white border-0 text-xs">Online</Badge>,
    },
    {
      icon: Users,
      label: "Total Users",
      value: isLoading ? "…" : stats?.totalUsers.toLocaleString("en-IN"),
    },
    {
      icon: ShoppingCart,
      label: "Total Sales (System-wide)",
      value: isLoading ? "…" : stats?.totalSales.toLocaleString("en-IN"),
    },
    {
      icon: Database,
      label: "Database Status",
      value: "Connected",
      badge: <Badge className="bg-green-600 hover:bg-green-700 text-white border-0 text-xs">Healthy</Badge>,
    },
    {
      icon: Code,
      label: "App Version",
      value: `v${APP_VERSION}`,
    },
    {
      icon: Clock,
      label: "Last Backup",
      value: "Managed by Cloud",
      badge: <Badge variant="outline" className="text-xs">Automatic</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">System Monitoring</h1>
        <p className="text-sm text-muted-foreground">
          Platform health, usage metrics, and configuration overview.
        </p>
      </div>

      {/* System Info Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {infoItems.map((item) => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.label}
              </CardTitle>
              <item.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-foreground">{item.value}</span>
                {item.badge}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Platform Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Platform</span>
            <Badge variant="outline">SaaS ERP</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Environment</span>
            <Badge variant={import.meta.env.PROD ? "default" : "secondary"}>
              {import.meta.env.PROD ? "Production" : "Development"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Dealers</span>
            <span className="text-sm font-medium text-foreground">
              {isLoading ? "…" : stats?.totalDealers}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Active Subscriptions</span>
            <span className="text-sm font-medium text-foreground">
              {isLoading ? "…" : stats?.activeSubs}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Users Overview */}
      <DealerUsersOverview />
    </div>
  );
};

export default SASystemPage;
