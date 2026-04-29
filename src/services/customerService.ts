/**
 * customerService — VPS cutover.
 *
 * On sanitileserp.com (AUTH_BACKEND === "vps"), ALL reads AND writes go
 * to the self-hosted backend at /api/customers. The Supabase fallback
 * remains for local dev / preview environments.
 *
 * Mirrors supplierService exactly — same USE_VPS gate, same vpsRequest
 * helper, same payload-builder pattern.
 */
import { supabase } from "@/integrations/supabase/client";
import { dataClient } from "@/lib/data/dataClient";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

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
const USE_VPS = env.AUTH_BACKEND === "vps";

const customersAdapter = dataClient<Customer>("CUSTOMERS");

async function vpsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

function buildWritePayload(form: Partial<CustomerFormData>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (form.name !== undefined) payload.name = form.name.trim();
  if (form.type !== undefined) payload.type = form.type;
  if (form.phone !== undefined) payload.phone = form.phone.trim() || null;
  if (form.email !== undefined) payload.email = form.email.trim() || null;
  if (form.address !== undefined) payload.address = form.address.trim() || null;
  if (form.reference_name !== undefined)
    payload.reference_name = form.reference_name.trim() || null;
  if (form.opening_balance !== undefined) payload.opening_balance = form.opening_balance;
  if (form.status !== undefined) payload.status = form.status;
  if (form.credit_limit !== undefined) payload.credit_limit = form.credit_limit;
  if (form.max_overdue_days !== undefined) payload.max_overdue_days = form.max_overdue_days;
  if (form.price_tier_id !== undefined) payload.price_tier_id = form.price_tier_id;
  return payload;
}

export const customerService = {
  async list(dealerId: string, search = "", typeFilter = "", page = 1) {
    const trimmed = search.trim();

    if (USE_VPS) {
      const params = new URLSearchParams({
        dealerId,
        page: String(Math.max(0, page - 1)),
        pageSize: String(PAGE_SIZE),
        orderBy: "name",
        orderDir: "asc",
      });
      if (trimmed) params.set("search", trimmed);
      if (typeFilter) params.set("f.type", typeFilter);
      const body = await vpsRequest<{ rows: Customer[]; total: number }>(
        `/api/customers?${params.toString()}`,
      );
      return { data: body.rows ?? [], total: body.total ?? 0 };
    }

    if (trimmed) {
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
    if (USE_VPS) {
      const body = await vpsRequest<{ row: Customer }>(`/api/customers/${id}`);
      if (!body.row) throw new Error("Customer not found");
      return body.row;
    }

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

  /**
   * Fetch customer due balance from customer_ledger.
   * VPS-aware: routes through /api/ledger/customers/due-balance on production hosts.
   */
  async getDueBalance(customerId: string, dealerId: string): Promise<number> {
    if (USE_VPS) {
      const body = await vpsRequest<{ balance: number }>(
        `/api/ledger/customers/due-balance/${customerId}?dealerId=${dealerId}`,
      );
      return Number(body.balance ?? 0);
    }

    const { data, error } = await supabase
      .from("customer_ledger")
      .select("amount, type")
      .eq("customer_id", customerId)
      .eq("dealer_id", dealerId);
    if (error) throw new Error(error.message);
    const total = (data ?? []).reduce((sum, row) => {
      const amt = Number(row.amount);
      if (row.type === "sale") return sum + amt;
      if (row.type === "payment" || row.type === "refund") return sum - amt;
      if (row.type === "adjustment") return sum + amt;
      return sum;
    }, 0);
    return Math.round(total * 100) / 100;
  },

  async create(dealerId: string, form: CustomerFormData) {
    if (USE_VPS) {
      const body = await vpsRequest<{ row: Customer }>(`/api/customers`, {
        method: "POST",
        body: JSON.stringify({ dealerId, data: buildWritePayload(form) }),
      });
      return body.row;
    }

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
    if (USE_VPS) {
      const payload = buildWritePayload(form);
      // opening_balance is not editable post-creation (backend also enforces)
      delete payload.opening_balance;
      await vpsRequest(`/api/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ data: payload }),
      });
      return;
    }

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

    const { error } = await supabase.from("customers").update(payload).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new Error("A customer with this name already exists.");
      throw new Error(error.message);
    }
  },

  async toggleStatus(id: string, status: "active" | "inactive") {
    if (USE_VPS) {
      await vpsRequest(`/api/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ data: { status } }),
      });
      return;
    }
    const { error } = await supabase.from("customers").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  },
};
