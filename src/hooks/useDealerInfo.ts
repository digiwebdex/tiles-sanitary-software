import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDealerId } from "@/hooks/useDealerId";

export interface DealerInfo {
  name: string;
  phone: string | null;
  address: string | null;
  challan_template: string;
  enable_reservations: boolean;
  default_wastage_pct: number;
}

export function useDealerInfo() {
  const dealerId = useDealerId();

  return useQuery({
    queryKey: ["dealer-info", dealerId],
    queryFn: async (): Promise<DealerInfo> => {
      const { data, error } = await supabase
        .from("dealers")
        .select("name, phone, address, challan_template, enable_reservations, default_wastage_pct")
        .eq("id", dealerId)
        .single();
      if (error) throw new Error(error.message);
      const row = data as Record<string, unknown>;
      return {
        name: String(row.name ?? ""),
        phone: (row.phone as string | null) ?? null,
        address: (row.address as string | null) ?? null,
        challan_template: String(row.challan_template ?? "classic"),
        enable_reservations: Boolean(row.enable_reservations),
        default_wastage_pct: Number(row.default_wastage_pct ?? 10),
      };
    },
    enabled: !!dealerId,
    staleTime: 5 * 60 * 1000, // cache 5 min
  });
}
