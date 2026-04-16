import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

export function ReservationDashboardWidgets({ dealerId }: ReservationWidgetsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-reservation-summary", dealerId],
    queryFn: async () => {
      const { data: reservations, error } = await supabase
        .from("stock_reservations")
        .select(`
          id, reserved_qty, fulfilled_qty, released_qty, status, expires_at,
          products:product_id (name, sku, default_sale_rate, unit_type),
          customers:customer_id (name)
        `)
        .eq("dealer_id", dealerId)
        .eq("status", "active");
      if (error) throw new Error(error.message);

      const now = new Date();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

      let activeHolds = 0;
      let totalReservedQty = 0;
      let totalReservedValue = 0;
      let expiringToday = 0;
      const expiringItems: { product: string; customer: string; remaining: number; daysLeft: number }[] = [];

      for (const r of reservations ?? []) {
        const remaining = Number(r.reserved_qty) - Number(r.fulfilled_qty) - Number(r.released_qty);
        if (remaining <= 0) continue;

        activeHolds++;
        totalReservedQty += remaining;
        totalReservedValue += remaining * Number((r as any).products?.default_sale_rate ?? 0);

        if (r.expires_at) {
          const exp = new Date(r.expires_at);
          const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
          if (exp <= todayEnd && exp >= now) expiringToday++;
          if (daysLeft <= 3 && daysLeft >= 0) {
            expiringItems.push({
              product: (r as any).products?.name ?? "—",
              customer: (r as any).customers?.name ?? "—",
              remaining,
              daysLeft,
            });
          }
        }
      }

      // Get aggregate reserved vs total
      const { data: stockData } = await supabase
        .from("stock")
        .select("box_qty, piece_qty, reserved_box_qty, reserved_piece_qty")
        .eq("dealer_id", dealerId);

      let totalStock = 0;
      let totalReservedAgg = 0;
      for (const s of stockData ?? []) {
        totalStock += Number(s.box_qty ?? 0) + Number(s.piece_qty ?? 0);
        totalReservedAgg += Number(s.reserved_box_qty ?? 0) + Number(s.reserved_piece_qty ?? 0);
      }
      const freeStock = totalStock - totalReservedAgg;
      const reservedPct = totalStock > 0 ? Math.round((totalReservedAgg / totalStock) * 100) : 0;

      return {
        activeHolds,
        totalReservedQty,
        totalReservedValue,
        expiringToday,
        expiringItems: expiringItems.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5),
        totalStock,
        totalReservedAgg,
        freeStock,
        reservedPct,
      };
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
