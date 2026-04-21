/**
 * productService — Phase 3D rewire.
 *
 * READS (`list` with no search, `getById`) now route through the shared
 * `dataClient` so the per-resource flag `VITE_DATA_PRODUCTS` controls the
 * backend:
 *
 *   supabase (default) → identical legacy behavior
 *   shadow             → Supabase remains primary; VPS read fired in
 *                        parallel and any drift logged to
 *                        `window.__vpsShadowStats` + scoped logger.
 *   vps                → reads served from the self-hosted API (cutover).
 *
 * WRITES (`create`, `update`, `toggleActive`) intentionally stay on
 * Supabase in Phase 3D. Product writes carry barcode auto-generation and
 * trigger downstream stock/batch interactions via existing services and
 * RPCs — we do NOT split that traffic until shadow runs clean.
 *
 * Search-mode list is also kept on the legacy Supabase OR-ilike path
 * (sku/name/barcode) to preserve exact behavior.
 *
 * Public function signatures are UNCHANGED so no UI/page code touches.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { validateInput, createProductServiceSchema, updateProductServiceSchema } from "@/lib/validators";
import { dataClient } from "@/lib/data/dataClient";

type Product = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

const PAGE_SIZE = 25;

// Memoized per (resource, backend) inside dataClient itself.
const productsAdapter = dataClient<Product>("PRODUCTS");

export const productService = {
  async list(dealerId: string, search?: string, page = 1) {
    const trimmed = search?.trim() ?? "";

    if (trimmed) {
      // Legacy path — preserves OR-ilike search semantics exactly
      // (sku | name | barcode). Search traffic stays on Supabase until
      // adapter contract supports free-text search.
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from("products")
        .select("*", { count: "exact" })
        .eq("dealer_id", dealerId)
        .or(`sku.ilike.%${trimmed}%,name.ilike.%${trimmed}%,barcode.ilike.%${trimmed}%`)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw new Error(error.message);
      return { data: (data ?? []) as Product[], total: count ?? 0 };
    }

    // Adapter path — eligible for shadow comparisons.
    const result = await productsAdapter.list({
      dealerId,
      page: Math.max(0, page - 1),
      pageSize: PAGE_SIZE,
      orderBy: { column: "created_at", direction: "desc" },
    });
    return { data: result.rows, total: result.total };
  },

  async getById(id: string) {
    // Resolve dealerId from the current authenticated user so the adapter
    // call stays tenant-scoped. Falls back to the legacy direct read when
    // no profile dealerId is available (e.g. super_admin contexts).
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;

    let dealerId: string | null = null;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("dealer_id")
        .eq("id", userId)
        .maybeSingle();
      dealerId = (profile?.dealer_id as string | null) ?? null;
    }

    if (!dealerId) {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      return data as Product;
    }

    const row = await productsAdapter.getById(id, dealerId);
    if (!row) throw new Error("Product not found");
    return row;
  },

  // ── Writes stay on Supabase in Phase 3D ──────────────────────────────────
  async create(product: ProductInsert) {
    validateInput(createProductServiceSchema, product);
    // Auto-generate barcode from SKU
    const payload = { ...product, barcode: product.sku };
    const { data, error } = await supabase
      .from("products")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Product;
  },

  async update(id: string, product: ProductUpdate) {
    validateInput(updateProductServiceSchema, product);
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
