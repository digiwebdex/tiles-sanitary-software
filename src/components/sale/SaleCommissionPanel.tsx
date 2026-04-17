import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HandCoins } from "lucide-react";
import { saleCommissionService, type CommissionStatus } from "@/services/commissionService";
import { formatCurrency } from "@/lib/utils";

const STATUS_COLORS: Record<CommissionStatus, string> = {
  pending: "text-amber-700 border-amber-300 bg-amber-50",
  earned: "text-blue-700 border-blue-300 bg-blue-50",
  settled: "text-emerald-700 border-emerald-300 bg-emerald-50",
  cancelled: "text-muted-foreground border-muted",
  adjusted: "text-purple-700 border-purple-300 bg-purple-50",
};

interface Props {
  saleId: string;
}

/**
 * Read-only commission summary for an invoice / sale detail page.
 * Renders nothing if the sale has no commission attached.
 */
export function SaleCommissionPanel({ saleId }: Props) {
  const { data: commission } = useQuery({
    queryKey: ["sale-commission", saleId],
    queryFn: () => saleCommissionService.getForSale(saleId),
    enabled: !!saleId,
  });

  if (!commission) return null;

  const ref = commission.referral_sources;

  return (
    <Card className="border-primary/20">
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <HandCoins className="h-4 w-4 text-primary" />
            <span>Referral & Commission</span>
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] capitalize ${STATUS_COLORS[commission.status]}`}
          >
            {commission.status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div>
            <span className="text-muted-foreground">Referrer: </span>
            <span className="font-medium">{ref?.name ?? "—"}</span>
            {ref?.source_type && (
              <Badge variant="secondary" className="ml-2 text-[10px] capitalize">
                {ref.source_type}
              </Badge>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Type: </span>
            <span className="font-medium">
              {commission.commission_type === "percent"
                ? `${commission.commission_value}% of sale`
                : "Fixed amount"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Base: </span>
            <span className="font-mono">
              {formatCurrency(Number(commission.commission_base_amount))}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Commission: </span>
            <span className="font-mono font-semibold text-primary">
              {formatCurrency(Number(commission.calculated_commission_amount))}
            </span>
          </div>
          {commission.status === "settled" && commission.settled_at && (
            <div className="col-span-2 text-emerald-700">
              Settled {formatCurrency(Number(commission.settled_amount))} on{" "}
              {new Date(commission.settled_at).toLocaleDateString()}
            </div>
          )}
        </div>

        {commission.notes && (
          <p className="text-[11px] text-muted-foreground italic">{commission.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default SaleCommissionPanel;
