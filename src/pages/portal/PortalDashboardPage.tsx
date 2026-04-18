import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import {
  getOutstandingSummary,
  listPortalDeliveries,
  listPortalQuotations,
  listPortalSales,
} from "@/services/portalService";
import { FileText, ShoppingBag, Truck, Wallet } from "lucide-react";

const fmtBDT = (n: number | null | undefined) =>
  `৳${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortalDashboardPage() {
  const { context } = usePortalAuth();
  const customerId = context?.customer_id ?? "";

  const outstandingQ = useQuery({
    queryKey: ["portal", "outstanding"],
    queryFn: getOutstandingSummary,
    enabled: !!customerId,
  });
  const quotationsQ = useQuery({
    queryKey: ["portal", "quotations", customerId],
    queryFn: () => listPortalQuotations(customerId),
    enabled: !!customerId,
  });
  const salesQ = useQuery({
    queryKey: ["portal", "sales", customerId],
    queryFn: () => listPortalSales(customerId),
    enabled: !!customerId,
  });
  const deliveriesQ = useQuery({
    queryKey: ["portal", "deliveries", customerId],
    queryFn: () => listPortalDeliveries(customerId),
    enabled: !!customerId,
  });

  const activeQuotes = (quotationsQ.data ?? []).filter((q) => q.status === "active").length;
  const openOrders = (salesQ.data ?? []).filter((s) => s.status !== "cancelled").length;
  const pendingDeliveries = (deliveriesQ.data ?? []).filter(
    (d) => d.status !== "delivered" && d.status !== "cancelled"
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground text-sm">
          Here's a quick overview of your account activity.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Outstanding"
          value={outstandingQ.isLoading ? null : fmtBDT(outstandingQ.data?.outstanding ?? 0)}
          tone={(outstandingQ.data?.outstanding ?? 0) > 0 ? "warn" : "ok"}
        />
        <KpiCard
          icon={<FileText className="h-4 w-4" />}
          label="Active quotations"
          value={quotationsQ.isLoading ? null : String(activeQuotes)}
        />
        <KpiCard
          icon={<ShoppingBag className="h-4 w-4" />}
          label="Open orders"
          value={salesQ.isLoading ? null : String(openOrders)}
        />
        <KpiCard
          icon={<Truck className="h-4 w-4" />}
          label="Pending deliveries"
          value={deliveriesQ.isLoading ? null : String(pendingDeliveries)}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outstanding summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Total billed" v={fmtBDT(outstandingQ.data?.total_billed)} />
            <Row k="Total paid" v={fmtBDT(outstandingQ.data?.total_paid)} />
            <Row
              k="Last payment"
              v={
                outstandingQ.data?.last_payment_date
                  ? `${outstandingQ.data.last_payment_date} · ${fmtBDT(outstandingQ.data.last_payment_amount)}`
                  : "—"
              }
            />
            <Row
              k="Outstanding"
              v={fmtBDT(outstandingQ.data?.outstanding)}
              accent={(outstandingQ.data?.outstanding ?? 0) > 0}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {salesQ.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (salesQ.data ?? []).slice(0, 5).length === 0 ? (
              <p className="text-muted-foreground">No orders yet.</p>
            ) : (
              (salesQ.data ?? []).slice(0, 5).map((s) => (
                <div key={s.id} className="flex justify-between border-b border-border last:border-0 pb-1.5">
                  <div>
                    <div className="font-medium">{s.invoice_no ?? s.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{s.sale_date}</div>
                  </div>
                  <div className="text-right">
                    <div>{fmtBDT(s.total_amount)}</div>
                    <div className="text-xs text-muted-foreground">{s.status}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  tone?: "ok" | "warn";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          {icon} {label}
        </div>
        {value === null ? (
          <Skeleton className="h-6 w-20" />
        ) : (
          <div
            className={`text-xl font-bold ${
              tone === "warn" ? "text-destructive" : "text-foreground"
            }`}
          >
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between border-b border-border last:border-0 pb-1.5">
      <span className="text-muted-foreground">{k}</span>
      <span className={accent ? "font-bold text-destructive" : "font-medium"}>{v}</span>
    </div>
  );
}
