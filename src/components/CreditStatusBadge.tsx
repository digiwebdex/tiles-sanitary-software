import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getCreditStatus, type CreditStatus } from "@/services/creditService";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface CreditStatusBadgeProps {
  outstanding: number;
  creditLimit: number;
  overdueDays?: number;
  maxOverdueDays?: number;
  className?: string;
  showTooltip?: boolean;
}

const STATUS_CONFIG: Record<CreditStatus, { label: string; className: string }> = {
  safe: {
    label: "Safe",
    className: "bg-green-100 text-green-800 border-green-300 hover:bg-green-100",
  },
  near: {
    label: "Near Limit",
    className: "bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100",
  },
  exceeded: {
    label: "Exceeded",
    className: "bg-red-100 text-red-800 border-red-300 hover:bg-red-100",
  },
  no_limit: {
    label: "No Limit",
    className: "bg-muted text-muted-foreground border-border hover:bg-muted",
  },
};

export const CreditStatusBadge = ({
  outstanding,
  creditLimit,
  overdueDays = 0,
  maxOverdueDays = 0,
  className,
  showTooltip = true,
}: CreditStatusBadgeProps) => {
  const isOverdue = maxOverdueDays > 0 && overdueDays > maxOverdueDays;
  const status = getCreditStatus(outstanding, creditLimit);
  const config = STATUS_CONFIG[status];

  const badge = (
    <Badge
      variant="outline"
      className={cn(config.className, className)}
    >
      {isOverdue ? `⚠ Overdue ${overdueDays}d` : `● ${config.label}`}
    </Badge>
  );

  if (!showTooltip) return badge;

  const tooltipLines = [
    `Outstanding: ${formatCurrency(outstanding)}`,
    creditLimit > 0 ? `Credit Limit: ${formatCurrency(creditLimit)}` : "No credit limit set",
    creditLimit > 0
      ? `Used: ${Math.min(100, Math.round((outstanding / creditLimit) * 100))}%`
      : null,
    overdueDays > 0 ? `Overdue: ${overdueDays} days` : null,
    maxOverdueDays > 0 ? `Max allowed: ${maxOverdueDays} days` : null,
  ].filter(Boolean);

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5 text-xs">
          {tooltipLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
