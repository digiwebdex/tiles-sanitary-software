import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CmsSection = {
  section_key: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  button_text: string | null;
  button_link: string | null;
  extra_json: Record<string, any> | null;
  updated_at: string;
};

/** Fetches all website_content rows, cached for 10 minutes (public read). */
export function useCmsContent() {
  return useQuery<Record<string, CmsSection>>({
    queryKey: ["cms-content-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_content")
        .select(
          "section_key, title, subtitle, description, button_text, button_link, extra_json, updated_at"
        );
      if (error) throw new Error(error.message);
      const map: Record<string, CmsSection> = {};
      for (const row of data ?? []) {
        map[row.section_key] = row as CmsSection;
      }
      return map;
    },
    staleTime: 10 * 60 * 1000, // 10 min cache — content rarely changes
    gcTime:    30 * 60 * 1000, // keep in memory 30 min
  });
}

/** Pull one section and merge with defaults. Returns merged object. */
export function useCmsSection<T extends Record<string, any>>(
  sections: Record<string, CmsSection> | undefined,
  key: string,
  defaults: T
): T & CmsSection {
  const row = sections?.[key];
  return {
    ...defaults,
    ...row,
    extra_json: { ...(defaults as any).extra_json, ...(row?.extra_json ?? {}) },
  } as T & CmsSection;
}
