import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Truck, ShoppingCart, Wallet, AlertTriangle, Clock, TrendingUp,
} from "lucide-react";
import { supplierPerformanceService } from "@/services/supplierPerformanceService";
import { formatCurrency } from "@/lib/utils";
import { ReliabilityBadge } from "@/modules/reports/SupplierPerformanceReports";

interface Props {
  dealerId: string;
  supplierId: string;
}

/**
 * Performance summary card shown inside the supplier detail/edit page.
 * Read-only — purely derived from existing purchase + ledger data.
 */
export function SupplierPerformancePanel({ dealerId, supplierId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["supplier-performance-one", dealerId, supplierId],
    queryFn: () => supplierPerformanceService.getForSupplier(dealerId, supplierId),
    enabled: !!dealerId && !!supplierId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" /> Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.total_purchases === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" /> Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No purchase history yet — performance metrics will appear once you log purchases.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" /> Performance
          </CardTitle>
          <div className="flex items-center gap-2">
            <ReliabilityBadge band={data.reliability_band} />
            <span className="text-xs text-muted-foreground">
              Score <span className="font-semibold text-foreground">{data.reliability_score}</span>/100
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric
            icon={<ShoppingCart className="h-3.5 w-3.5" />}
            label="Total Purchases"
            value={String(data.total_purchases)}
            sub={formatCurrency(data.total_purchase_value)}
          />
          <Metric
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Avg Purchase Value"
            value={formatCurrency(data.avg_purchase_value)}
          />
          <Metric
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Avg Gap"
            value={data.avg_days_between_purchases !== null ? `${data.avg_days_between_purchases}d` : "—"}
            sub={data.last_purchase_date ? `Last: ${data.last_purchase_date}` : "No purchases"}
          />
          <Metric
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="Return Rate"
            value={`${data.return_rate_pct.toFixed(2)}%`}
            sub={`${data.total_returns} return${data.total_returns === 1 ? "" : "s"} · ${formatCurrency(data.total_return_value)}`}
            danger={data.return_rate_pct > 5}
          />
          <Metric
            icon={<Wallet className="h-3.5 w-3.5" />}
            label="Outstanding"
            value={formatCurrency(data.outstanding_amount)}
            danger={data.outstanding_amount > data.avg_purchase_value * 5 && data.avg_purchase_value > 0}
          />
          <Metric
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Days Since Last"
            value={data.days_since_last_purchase !== null ? `${data.days_since_last_purchase}d` : "—"}
            danger={(data.days_since_last_purchase ?? 0) > 90}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`text-sm font-semibold mt-0.5 ${danger ? "text-destructive" : "text-foreground"}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default SupplierPerformancePanel;
