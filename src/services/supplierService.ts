/**
 * supplierService — Phase 3C cutover for VPS hosts.
 *
 * On sanitileserp.com (AUTH_BACKEND === "vps"), ALL reads AND writes go
 * to the self-hosted backend at /api/suppliers. The Supabase fallback
 * remains for local dev / preview environments where VPS is not the
 * active backend.
 *
 * Why: after the auth migration to VPS, the Supabase session no longer
 * exists in production, so any direct Supabase write fails with 401 +
 * RLS "new row violates row-level security policy" — exactly what the
 * Add Supplier form was hitting.
 */
import { supabase } from "@/integrations/supabase/client";
import { dataClient } from "@/lib/data/dataClient";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

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
const USE_VPS = env.AUTH_BACKEND === "vps";

const suppliersAdapter = dataClient<Supplier>("SUPPLIERS");

async function vpsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

function buildWritePayload(form: Partial<SupplierFormData>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (form.name !== undefined) payload.name = form.name.trim();
  if (form.contact_person !== undefined) payload.contact_person = form.contact_person.trim() || null;
  if (form.phone !== undefined) payload.phone = form.phone.trim() || null;
  if (form.email !== undefined) payload.email = form.email.trim() || null;
  if (form.address !== undefined) payload.address = form.address.trim() || null;
  if (form.gstin !== undefined) payload.gstin = form.gstin.trim() || null;
  if (form.opening_balance !== undefined) payload.opening_balance = form.opening_balance;
  if (form.status !== undefined) payload.status = form.status;
  return payload;
}

export const supplierService = {
  async list(dealerId: string, search = "", page = 1) {
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
      const body = await vpsRequest<{ rows: Supplier[]; total: number }>(
        `/api/suppliers?${params.toString()}`,
      );
      return { data: body.rows ?? [], total: body.total ?? 0 };
    }

    if (trimmed) {
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

    const result = await suppliersAdapter.list({
      dealerId,
      page: Math.max(0, page - 1),
      pageSize: PAGE_SIZE,
      orderBy: { column: "name", direction: "asc" },
    });
    return { data: result.rows, total: result.total };
  },

  async getById(id: string) {
    if (USE_VPS) {
      // Backend resolves dealer scope from the JWT for dealer users.
      const body = await vpsRequest<{ row: Supplier }>(`/api/suppliers/${id}`);
      if (!body.row) throw new Error("Supplier not found");
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

  async create(dealerId: string, form: SupplierFormData) {
    if (USE_VPS) {
      const body = await vpsRequest<{ row: Supplier }>(`/api/suppliers`, {
        method: "POST",
        body: JSON.stringify({ dealerId, data: buildWritePayload(form) }),
      });
      return body.row;
    }

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
    if (USE_VPS) {
      const payload = buildWritePayload(form);
      // opening_balance is not editable post-creation (backend also enforces)
      delete payload.opening_balance;
      await vpsRequest(`/api/suppliers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ data: payload }),
      });
      return;
    }

    const payload: Record<string, unknown> = {};
    if (form.name !== undefined) payload.name = form.name.trim();
    if (form.contact_person !== undefined) payload.contact_person = form.contact_person.trim() || null;
    if (form.phone !== undefined) payload.phone = form.phone.trim() || null;
    if (form.email !== undefined) payload.email = form.email.trim() || null;
    if (form.address !== undefined) payload.address = form.address.trim() || null;
    if (form.gstin !== undefined) payload.gstin = form.gstin.trim() || null;
    if (form.status !== undefined) payload.status = form.status;

    const { error } = await supabase.from("suppliers").update(payload).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new Error("A supplier with this name already exists.");
      throw new Error(error.message);
    }
  },

  async toggleStatus(id: string, status: "active" | "inactive") {
    if (USE_VPS) {
      await vpsRequest(`/api/suppliers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ data: { status } }),
      });
      return;
    }
    const { error } = await supabase.from("suppliers").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  },
};
