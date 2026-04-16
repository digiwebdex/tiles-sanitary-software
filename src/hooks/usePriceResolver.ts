import { useQuery } from "@tanstack/react-query";
import { pricingTierService, type ResolvedPrice } from "@/services/pricingTierService";

/**
 * Returns a Map<product_id, ResolvedPrice> for the given tier.
 * Use this in forms (Quotation/Sale/POS) to auto-fill rates after a customer
 * with a tier is selected. The map auto-updates when tierId changes.
 */
export function usePriceResolver(dealerId: string, productIds: string[], tierId: string | null) {
  const sortedIds = [...productIds].sort();
  return useQuery({
    queryKey: ["price-resolver", dealerId, tierId ?? "__none", sortedIds.join(",")],
    queryFn: async () => pricingTierService.resolvePricesBatch(dealerId, sortedIds, tierId),
    enabled: !!dealerId && sortedIds.length > 0,
    staleTime: 30_000,
  });
}

export function rateSourceLabel(source: ResolvedPrice["source"]): string {
  if (source === "tier") return "Tier";
  if (source === "manual") return "Manual";
  return "Default";
}
