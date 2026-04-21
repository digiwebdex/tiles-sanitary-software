/**
 * supplierService — Phase 3B rewire.
 *
 * READS (`list`, `getById`) now go through the shared `dataClient` so that
 * the per-resource flag `VITE_DATA_SUPPLIERS` controls the backend:
 *
 *   supabase (default) → identical legacy behavior
 *   shadow             → Supabase remains primary; VPS read fired in
 *                        parallel and any drift logged to
 *                        `window.__vpsShadowStats` + scoped logger.
 *   vps                → reads served from the self-hosted API (cutover).
 *
 * WRITES (`create`, `update`, `toggleStatus`) intentionally stay on
 * Supabase in Phase 3B. The shadow phase is read-verification only — we
 * do NOT want write traffic doubled or split until shadow runs clean.
 *
 * The public function signatures are UNCHANGED so that no UI/page code
 * needs to be touched in this phase.
 */
import { supabase } from "@/integrations/supabase/client";
import { dataClient } from "@/lib/data/dataClient";

export interface Supplier {
  id: string;
  dealer_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  opening_balance: number;
  status: string;
  created_at: string;
}

export interface SupplierFormData {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  opening_balance: number;
  status: "active" | "inactive";
}

const PAGE_SIZE = 25;

// Single shared adapter handle for the SUPPLIERS resource.
// dataClient is itself memoized per (resource, backend), so this is safe.
const suppliersAdapter = dataClient<Supplier>("SUPPLIERS");

export const supplierService = {
  /**
   * UI contract preserved: 1-indexed page, optional search string.
   *
   * Internally we translate to the adapter's 0-indexed `ListQuery`. The
   * Supabase adapter does not yet implement free-text search the same way
   * the legacy code did (name/contact/phone OR-ilike), so when a search
   * term is supplied we fall back to the legacy direct Supabase query to
   * avoid behavior regression. Empty-search list pages — by far the most
   * common path — flow through the adapter and therefore through shadow.
   */
  async list(dealerId: string, search = "", page = 1) {
    const trimmed = search.trim();

    if (trimmed) {
      // Legacy path — preserves OR-ilike search semantics exactly.
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("suppliers")
        .select("*", { count: "exact" })
        .eq("dealer_id", dealerId)
        .or(
          `name.ilike.%${trimmed}%,contact_person.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`,
        )
        .order("name")
        .range(from, to);
      if (error) throw new Error(error.message);
      return { data: (data ?? []) as Supplier[], total: count ?? 0 };
    }

    // Adapter path — eligible for shadow comparisons.
    const result = await suppliersAdapter.list({
      dealerId,
      page: Math.max(0, page - 1),
      pageSize: PAGE_SIZE,
      orderBy: { column: "name", direction: "asc" },
    });
    return { data: result.rows, total: result.total };
  },

  async getById(id: string) {
    // We need the row's dealer_id for tenant-safe adapter access. The
    // legacy call site (`EditSupplier`) does not pass dealerId, so we
    // resolve it from the current authenticated user's profile.
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
      // Fallback to legacy direct read (preserves existing behavior for
      // super-admin / edge cases where the profile lookup fails).
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      return data as Supplier;
    }

    const row = await suppliersAdapter.getById(id, dealerId);
    if (!row) throw new Error("Supplier not found");
    return row;
  },

  // ── Writes stay on Supabase in Phase 3B ──────────────────────────────────
  async create(dealerId: string, form: SupplierFormData) {
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        dealer_id: dealerId,
        name: form.name.trim(),
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        gstin: form.gstin.trim() || null,
        opening_balance: form.opening_balance,
        status: form.status,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("A supplier with this name already exists.");
      throw new Error(error.message);
    }
    return data as Supplier;
  },

  async update(id: string, form: Partial<SupplierFormData>) {
    const payload: Record<string, unknown> = {};
    if (form.name !== undefined) payload.name = form.name.trim();
    if (form.contact_person !== undefined) payload.contact_person = form.contact_person.trim() || null;
    if (form.phone !== undefined) payload.phone = form.phone.trim() || null;
    if (form.email !== undefined) payload.email = form.email.trim() || null;
    if (form.address !== undefined) payload.address = form.address.trim() || null;
    if (form.gstin !== undefined) payload.gstin = form.gstin.trim() || null;
    if (form.status !== undefined) payload.status = form.status;
    // opening_balance is intentionally NOT editable after creation

    const { error } = await supabase.from("suppliers").update(payload).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new Error("A supplier with this name already exists.");
      throw new Error(error.message);
    }
  },

  async toggleStatus(id: string, status: "active" | "inactive") {
    const { error } = await supabase.from("suppliers").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  },
};
