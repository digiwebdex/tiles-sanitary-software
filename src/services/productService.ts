import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Product = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

const PAGE_SIZE = 25;

export const productService = {
  async list(dealerId: string, search?: string, page = 1) {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("products")
      .select("*", { count: "exact" })
      .eq("dealer_id", dealerId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search?.trim()) {
      query = query.or(`sku.ilike.%${search.trim()}%,name.ilike.%${search.trim()}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { data: (data ?? []) as Product[], total: count ?? 0 };
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data as Product;
  },

  async create(product: ProductInsert) {
    const { data, error } = await supabase
      .from("products")
      .insert(product)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Product;
  },

  async update(id: string, product: ProductUpdate) {
    const { data, error } = await supabase
      .from("products")
      .update(product)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Product;
  },

  async toggleActive(id: string, active: boolean) {
    return this.update(id, { active });
  },
};
