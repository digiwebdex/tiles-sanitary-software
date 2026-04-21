/**
 * Supabase adapter (Phase 2).
 *
 * This is a thin passthrough that maps the generic ResourceAdapter
 * interface onto Supabase's PostgREST client. It is the DEFAULT adapter
 * for every resource — flipping VITE_DATA_<X> to "supabase" (or leaving
 * it unset) keeps existing behavior identical.
 *
 * NOTE: Existing services (productService, customerService, etc.) DO NOT
 * use this adapter yet. It exists as a stable foundation so Phase 3 can
 * migrate one resource at a time.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ListQuery, ListResult, ResourceAdapter, ResourceName } from "./types";

const RESOURCE_TABLE: Record<ResourceName, string> = {
  CUSTOMERS: "customers",
  SUPPLIERS: "suppliers",
  PRODUCTS: "products",
  STOCK: "stock",
  BATCHES: "product_batches",
  SALES: "sales",
  QUOTATIONS: "quotations",
  DELIVERIES: "deliveries",
  PURCHASES: "purchases",
};

export function createSupabaseAdapter<T = unknown>(
  resource: ResourceName,
): ResourceAdapter<T> {
  const table = RESOURCE_TABLE[resource];

  return {
    async list(query: ListQuery): Promise<ListResult<T>> {
      const page = query.page ?? 0;
      const pageSize = query.pageSize ?? 25;
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let q = (supabase as any)
        .from(table)
        .select("*", { count: "exact" })
        .eq("dealer_id", query.dealerId);

      if (query.filters) {
        for (const [k, v] of Object.entries(query.filters)) {
          if (v === null) q = q.is(k, null);
          else q = q.eq(k, v);
        }
      }

      if (query.orderBy) {
        q = q.order(query.orderBy.column, {
          ascending: query.orderBy.direction === "asc",
        });
      }

      q = q.range(from, to);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as T[], total: count ?? 0 };
    },

    async getById(id: string, dealerId: string): Promise<T | null> {
      const { data, error } = await (supabase as any)
        .from(table)
        .select("*")
        .eq("dealer_id", dealerId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as T) ?? null;
    },

    async create(data, dealerId: string): Promise<T> {
      const payload = { ...(data as Record<string, unknown>), dealer_id: dealerId };
      const { data: row, error } = await (supabase as any)
        .from(table)
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return row as T;
    },

    async update(id: string, data, dealerId: string): Promise<T> {
      const { data: row, error } = await (supabase as any)
        .from(table)
        .update(data as Record<string, unknown>)
        .eq("dealer_id", dealerId)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return row as T;
    },

    async remove(id: string, dealerId: string): Promise<void> {
      const { error } = await (supabase as any)
        .from(table)
        .delete()
        .eq("dealer_id", dealerId)
        .eq("id", id);
      if (error) throw error;
    },
  };
}
