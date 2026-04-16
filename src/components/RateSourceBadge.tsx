import { Badge } from "@/components/ui/badge";
import type { RateSource } from "@/services/pricingTierService";

interface Props {
  source: RateSource | string | null | undefined;
  className?: string;
}

/**
 * Visual indicator for the origin of a line-item rate.
 *  - default → muted grey
 *  - tier    → primary blue
 *  - manual  → warning amber
 */
const RateSourceBadge = ({ source, className }: Props) => {
  const s = (source ?? "default") as RateSource;
  if (s === "tier") {
    return (
      <Badge variant="outline" className={`border-primary/40 text-primary ${className ?? ""}`}>
        Tier
      </Badge>
    );
  }
  if (s === "manual") {
    return (
      <Badge variant="outline" className={`border-warning/40 text-warning ${className ?? ""}`}>
        Manual
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className={className}>
      Default
    </Badge>
  );
};

export default RateSourceBadge;
