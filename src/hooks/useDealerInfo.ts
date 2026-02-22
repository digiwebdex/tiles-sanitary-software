import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDealerId } from "@/hooks/useDealerId";

export interface DealerInfo {
  name: string;
  phone: string | null;
  address: string | null;
  challan_template: string;
}

export function useDealerInfo() {
  const dealerId = useDealerId();

  return useQuery({
    queryKey: ["dealer-info", dealerId],
    queryFn: async (): Promise<DealerInfo> => {
      const { data, error } = await supabase
        .from("dealers")
        .select("name, phone, address, challan_template")
        .eq("id", dealerId)
        .single();
      if (error) throw new Error(error.message);
      return data as DealerInfo;
    },
    enabled: !!dealerId,
    staleTime: 5 * 60 * 1000, // cache 5 min
  });
}
