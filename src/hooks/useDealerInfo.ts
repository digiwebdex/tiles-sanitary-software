import { useQuery } from "@tanstack/react-query";
import { useDealerId } from "@/hooks/useDealerId";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export interface DealerInfo {
  name: string;
  phone: string | null;
  address: string | null;
  challan_template: string;
  enable_reservations: boolean;
  default_wastage_pct: number;
  /** Phase 3U-30: surfaced from `/api/dealers/:id` so SaleForm can gate backorders without a separate Supabase round-trip. */
  allow_backorder: boolean;
}

/**
 * Phase 3U-27: Migrated from Supabase `dealers` select to VPS GET /api/dealers/:id.
 * The endpoint returns { dealer, users, subscription }; we only consume `dealer`.
 *
 * Phase 3U-30: extended to surface `allow_backorder` so SaleForm can ditch its
 * inline `supabase.from('dealers').select('allow_backorder')` query.
 */
export function useDealerInfo() {
  const dealerId = useDealerId();

  return useQuery({
    queryKey: ["dealer-info", dealerId],
    queryFn: async (): Promise<DealerInfo> => {
      const res = await vpsAuthedFetch(`/api/dealers/${dealerId}`);
      const body = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const msg = (body as any)?.error || `Failed to load dealer info (${res.status})`;
        throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
      const row = (body as any)?.dealer ?? {};
      return {
        name: String(row.name ?? ""),
        phone: (row.phone as string | null) ?? null,
        address: (row.address as string | null) ?? null,
        challan_template: String(row.challan_template ?? "classic"),
        enable_reservations: Boolean(row.enable_reservations),
        default_wastage_pct: Number(row.default_wastage_pct ?? 10),
        allow_backorder: Boolean(row.allow_backorder),
      };
    },
    enabled: !!dealerId,
    staleTime: 5 * 60 * 1000, // cache 5 min
  });
}
