import { useQuery } from "@tanstack/react-query";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Lock, Clock, ShieldCheck, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ReservationWidgetsProps {
  dealerId: string;
}

interface SummaryResponse {
  activeHolds: number;
  totalReservedQty: number;
  totalReservedValue: number;
  expiringToday: number;
  expiringItems: { product: string; customer: string; remaining: number; daysLeft: number }[];
  totalStock: number;
  totalReservedAgg: number;
  freeStock: number;
  reservedPct: number;
}

export function ReservationDashboardWidgets({ dealerId }: ReservationWidgetsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-reservation-summary", dealerId],
    queryFn: async (): Promise<SummaryResponse> => {
      const res = await vpsAuthedFetch(
        `/api/dashboard/reservation-summary?dealerId=${encodeURIComponent(dealerId)}`,
      );
      if (!res.ok) throw new Error(`reservation-summary failed: ${res.status}`);
      return res.json();
    },
    enabled: !!dealerId,
  });

  if (isLoading || !data) return null;
  if (data.activeHolds === 0 && data.expiringToday === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-0.5">Stock Reservations</h2>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active Holds</CardTitle>
            <Lock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-foreground">{data.activeHolds}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data.totalReservedQty} units reserved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Reserved Value</CardTitle>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-foreground">{formatCurrency(data.totalReservedValue)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Est. at sale rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Free vs Reserved</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-foreground">{data.reservedPct}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data.freeStock} free / {data.totalReservedAgg} reserved</p>
          </CardContent>
        </Card>

        <Card className={data.expiringToday > 0 ? "border-amber-500/40 bg-amber-50/50 dark:bg-amber-900/10" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Expiring Today</CardTitle>
            <Clock className={`h-4 w-4 ${data.expiringToday > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-lg font-bold ${data.expiringToday > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
              {data.expiringToday}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Reservations expiring</p>
          </CardContent>
        </Card>
      </div>

      {/* Expiring soon list */}
      {data.expiringItems.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Reservations Expiring Soon
              <Badge variant="secondary" className="text-[10px]">{data.expiringItems.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Product</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs text-right">Held</TableHead>
                    <TableHead className="text-xs text-right">Days Left</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expiringItems.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-2 text-xs font-medium">{item.product}</TableCell>
                      <TableCell className="py-2 text-xs">{item.customer}</TableCell>
                      <TableCell className="py-2 text-xs text-right font-semibold">{item.remaining}</TableCell>
                      <TableCell className="py-2 text-xs text-right">
                        <Badge variant={item.daysLeft === 0 ? "destructive" : "secondary"} className="text-[10px]">
                          {item.daysLeft === 0 ? "Today" : `${item.daysLeft}d`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
