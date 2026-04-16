import { supabase } from "@/integrations/supabase/client";

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

export const customerService = {
  async list(dealerId: string, search = "", typeFilter = "", page = 1) {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("customers")
      .select("*", { count: "exact" })
      .eq("dealer_id", dealerId)
      .order("name");

    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,reference_name.ilike.%${search}%`);
    }

    if (typeFilter) {
      query = query.eq("type", typeFilter as CustomerType);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw new Error(error.message);
    return { data: (data ?? []) as Customer[], total: count ?? 0 };
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data as Customer;
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
