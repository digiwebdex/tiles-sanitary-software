import { supabase } from "@/integrations/supabase/client";

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

export const supplierService = {
  async list(dealerId: string, search = "", page = 1) {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("suppliers")
      .select("*", { count: "exact" })
      .eq("dealer_id", dealerId)
      .order("name");

    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,contact_person.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw new Error(error.message);
    return { data: (data ?? []) as Supplier[], total: count ?? 0 };
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data as Supplier;
  },

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
