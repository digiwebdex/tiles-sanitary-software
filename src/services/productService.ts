/**
 * productService — full VPS rewire (Phase 3D ⇒ 3D-cutover).
 *
 * Every entry point now flows through the shared `dataClient` so the
 * per-resource flag `VITE_DATA_PRODUCTS` controls the backend:
 *
 *   supabase (default) → identical legacy behavior (Lovable Cloud / PostgREST).
 *   shadow             → Supabase primary + parallel VPS read for diff logging.
 *   vps                → ALL reads + writes served by the self-hosted API.
 *
 * Writes (`create`, `update`, `toggleActive`) used to stay on Supabase. With
 * VITE_DATA_PRODUCTS=vps they now POST/PATCH /api/products on the VPS — the
 * backend route handles barcode auto-generation, dealer scoping, role gates,
 * and uniqueness errors. This removes the cross-domain RLS error that
 * appeared when the frontend was authed against VPS but products still
 * targeted Supabase.
 *
 * Search-mode list also routes through the adapter — VPS supports the same
 * sku|name|barcode ILIKE semantics natively.
 *
 * Public function signatures are UNCHANGED so no UI/page code touches.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { validateInput, createProductServiceSchema, updateProductServiceSchema } from "@/lib/validators";
import { dataClient } from "@/lib/data/dataClient";
import { authBridge } from "@/lib/authBridge";
import { vpsTokenStore } from "@/lib/vpsAuthClient";

type Product = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

const PAGE_SIZE = 25;

// Memoized per (resource, backend) inside dataClient itself.
const productsAdapter = dataClient<Product>("PRODUCTS");

/**
 * Resolve a dealerId for write/getById calls.
 *   - VPS auth path: read from the locally cached VPS user.
 *   - Supabase auth path: read profiles.dealer_id for the auth user.
 *   - super_admin (no dealer) → return null so callers can fall back.
 */
async function resolveCurrentDealerId(): Promise<string | null> {
  if (authBridge.isVps) {
    return vpsTokenStore.user?.dealerId ?? null;
  }
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("dealer_id")
    .eq("id", userId)
    .maybeSingle();
  return (profile?.dealer_id as string | null) ?? null;
}

export const productService = {
  async list(dealerId: string, search?: string, page = 1) {
    const trimmed = search?.trim() ?? "";

    const result = await productsAdapter.list({
      dealerId,
      page: Math.max(0, page - 1),
      pageSize: PAGE_SIZE,
      search: trimmed || undefined,
      orderBy: { column: "created_at", direction: "desc" },
    });
    return { data: result.rows, total: result.total };
  },

  async getById(id: string) {
    const dealerId = await resolveCurrentDealerId();

    if (!dealerId) {
      // super_admin contexts without an impersonation target — legacy direct read.
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

  async create(product: ProductInsert) {
    validateInput(createProductServiceSchema, product);

    // dealer_id may be passed in by the caller; prefer it, else resolve.
    const dealerId =
      (product.dealer_id as string | undefined) ??
      (await resolveCurrentDealerId());
    if (!dealerId) {
      throw new Error("Cannot create product: no dealer context found.");
    }

    // Strip dealer_id from the payload — adapter sends it separately so the
    // VPS route can verify tenant scope server-side.
    const { dealer_id: _omit, ...rest } = product as Record<string, unknown>;
    // Auto-generate barcode from SKU when missing (mirrors legacy behavior).
    const payload = {
      ...rest,
      barcode: (rest as any).barcode ?? (rest as any).sku,
    };

    return productsAdapter.create(payload as Partial<Product>, dealerId) as Promise<Product>;
  },

  async update(id: string, product: ProductUpdate) {
    validateInput(updateProductServiceSchema, product);

    const dealerId = await resolveCurrentDealerId();
    if (!dealerId) {
      throw new Error("Cannot update product: no dealer context found.");
    }

    // Never let a caller silently retarget the dealer_id of an existing row.
    const { dealer_id: _omit, ...rest } = product as Record<string, unknown>;

    return productsAdapter.update(id, rest as Partial<Product>, dealerId) as Promise<Product>;
  },

  async remove(id: string, dealerId?: string) {
    const resolvedDealerId = dealerId ?? (await resolveCurrentDealerId());
    if (!resolvedDealerId) {
      throw new Error("Cannot delete product: no dealer context found.");
    }

    await productsAdapter.remove(id, resolvedDealerId);
  },

  async isSkuUnique(sku: string, dealerId: string, productId?: string) {
    const result = await productsAdapter.list({
      dealerId,
      page: 0,
      pageSize: 1,
      filters: { sku: sku.trim() },
    });
    const existing = result.rows[0];
    return !existing || existing.id === productId;
  },

  async isBarcodeUnique(barcode: string, dealerId: string, productId?: string) {
    const result = await productsAdapter.list({
      dealerId,
      page: 0,
      pageSize: 1,
      filters: { barcode: barcode.trim() },
    });
    const existing = result.rows[0];
    return !existing || existing.id === productId;
  },

  async toggleActive(id: string, active: boolean) {
    return this.update(id, { active });
  },
};
