import { Badge } from "@/components/ui/badge";
import type { QuotationStatus } from "@/services/quotationService";

const STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: "Draft",
  active: "Active Quote",
  expired: "Expired",
  revised: "Revised",
  converted: "Converted to Sale",
  cancelled: "Cancelled",
};

// Map status → tailwind classes built from semantic tokens only.
const STATUS_CLASS: Record<QuotationStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  active: "bg-primary/15 text-primary border-primary/30",
  expired: "bg-destructive/15 text-destructive border-destructive/30",
  revised: "bg-secondary text-secondary-foreground border-border",
  converted: "bg-accent text-accent-foreground border-border",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
