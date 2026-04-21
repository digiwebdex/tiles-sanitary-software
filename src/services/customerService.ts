/**
 * customerService — Phase 3C rewire.
 *
 * READS (`list`, `getById`) now go through the shared `dataClient` so that
 * the per-resource flag `VITE_DATA_CUSTOMERS` controls the backend:
 *
 *   supabase (default) → identical legacy behavior
 *   shadow             → Supabase remains primary; VPS read fired in
 *                        parallel and any drift logged to
 *                        `window.__vpsShadowStats` + scoped logger.
 *   vps                → reads served from the self-hosted API (cutover).
 *
 * WRITES (`create`, `update`, `toggleStatus`) intentionally stay on
 * Supabase in Phase 3C. The shadow phase is read-verification only — we
 * do NOT want write traffic doubled or split until shadow runs clean.
 *
 * Public function signatures are UNCHANGED so no UI/page code touches.
 */
import { supabase } from "@/integrations/supabase/client";
import { dataClient } from "@/lib/data/dataClient";

export type CustomerType = "retailer" | "customer" | "project";

export interface Customer {
  id: string;
  dealer_id: string;
  name: string;
  type: CustomerType;
  phone: string | null;
  email: string | null;
  address: string | null;
  reference_name: string | null;
  opening_balance: number;
  status: string;
  created_at: string;
  credit_limit: number;
  max_overdue_days: number;
  price_tier_id: string | null;
}

export interface CustomerWithBalance extends Customer {
  due_balance: number;
}

export interface CustomerFormData {
  name: string;
  type: CustomerType;
  phone: string;
  email: string;
  address: string;
  reference_name: string;
  opening_balance: number;
  status: "active" | "inactive";
  credit_limit: number;
  max_overdue_days: number;
  price_tier_id: string | null;
}

const PAGE_SIZE = 25;

// Memoized per (resource, backend) inside dataClient itself.
const customersAdapter = dataClient<Customer>("CUSTOMERS");

export const customerService = {
  /**
   * UI contract preserved: 1-indexed page, optional search, optional
   * type filter. Search uses an OR-ilike across name/phone/reference_name
   * which the adapter contract does not yet express, so when search is
   * non-empty we keep the legacy direct Supabase path. Empty-search
   * pages — the dominant traffic — flow through the adapter and are
   * therefore eligible for shadow comparisons.
   */
  async list(dealerId: string, search = "", typeFilter = "", page = 1) {
    const trimmed = search.trim();

    if (trimmed) {
      // Legacy path — preserves OR-ilike search semantics exactly.
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("customers")
        .select("*", { count: "exact" })
        .eq("dealer_id", dealerId)
        .or(
          `name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,reference_name.ilike.%${trimmed}%`,
        )
        .order("name");

      if (typeFilter) {
        query = query.eq("type", typeFilter as CustomerType);
      }

      const { data, error, count } = await query.range(from, to);
      if (error) throw new Error(error.message);
      return { data: (data ?? []) as Customer[], total: count ?? 0 };
    }

    // Adapter path — eligible for shadow comparisons.
    const result = await customersAdapter.list({
      dealerId,
      page: Math.max(0, page - 1),
      pageSize: PAGE_SIZE,
      orderBy: { column: "name", direction: "asc" },
      filters: typeFilter ? { type: typeFilter } : undefined,
    });
    return { data: result.rows, total: result.total };
  },

  async getById(id: string) {
    // Resolve dealerId from the current authenticated user so the adapter
    // call stays tenant-scoped. Falls back to the legacy direct read if
    // the profile lookup yields no dealerId (e.g. super_admin contexts).
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
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      return data as Customer;
    }

    const row = await customersAdapter.getById(id, dealerId);
    if (!row) throw new Error("Customer not found");
    return row;
  },

  /** Fetch customer due balance from customer_ledger (sum of all entries). */
  async getDueBalance(customerId: string, dealerId: string): Promise<number> {
    const { data, error } = await supabase
      .from("customer_ledger")
      .select("amount, type")
      .eq("customer_id", customerId)
      .eq("dealer_id", dealerId);
    if (error) throw new Error(error.message);
    // sale → debit (owed by customer), refund/adjustment → credit (reduces due)
    const total = (data ?? []).reduce((sum, row) => {
      const amt = Number(row.amount);
      if (row.type === "sale") return sum + amt;
      if (row.type === "payment" || row.type === "refund") return sum - amt;
      // opening balance adjustment = debit (customer owes from day 1)
      if (row.type === "adjustment") return sum + amt;
      return sum;
    }, 0);
    return Math.round(total * 100) / 100;
  },

  // ── Writes stay on Supabase in Phase 3C ──────────────────────────────────
  async create(dealerId: string, form: CustomerFormData) {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        dealer_id: dealerId,
        name: form.name.trim(),
        type: form.type,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        reference_name: form.reference_name.trim() || null,
        opening_balance: form.opening_balance,
        status: form.status,
        credit_limit: form.credit_limit ?? 0,
        max_overdue_days: form.max_overdue_days ?? 0,
        price_tier_id: form.price_tier_id ?? null,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("A customer with this name already exists.");
      throw new Error(error.message);
    }
    return data as Customer;
  },

  async update(id: string, form: Partial<CustomerFormData>) {
    const payload: Record<string, unknown> = {};
    if (form.name !== undefined) payload.name = form.name.trim();
    if (form.type !== undefined) payload.type = form.type;
    if (form.phone !== undefined) payload.phone = form.phone.trim() || null;
    if (form.email !== undefined) payload.email = form.email.trim() || null;
    if (form.address !== undefined) payload.address = form.address.trim() || null;
    if (form.reference_name !== undefined) payload.reference_name = form.reference_name.trim() || null;
    if (form.status !== undefined) payload.status = form.status;
    if (form.credit_limit !== undefined) payload.credit_limit = form.credit_limit;
    if (form.max_overdue_days !== undefined) payload.max_overdue_days = form.max_overdue_days;
    if (form.price_tier_id !== undefined) payload.price_tier_id = form.price_tier_id;
    // opening_balance intentionally NOT editable after creation

    const { error } = await supabase.from("customers").update(payload).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new Error("A customer with this name already exists.");
      throw new Error(error.message);
    }
  },

  async toggleStatus(id: string, status: "active" | "inactive") {
    const { error } = await supabase.from("customers").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  },
};
