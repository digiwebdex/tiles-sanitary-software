/**
 * ledgerService — VPS cutover.
 *
 * On VPS hosts (AUTH_BACKEND === "vps"), all reads/writes go through
 * /api/ledger/{customers|suppliers|cash|expenses}. Otherwise falls back
 * to Supabase (legacy / local dev).
 */
import { supabase } from "@/integrations/supabase/client";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export interface LedgerEntry {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  entry_date: string;
  created_at: string;
}

export interface MonthlySummary {
  month: string;
  credit: number;
  debit: number;
  balance: number;
}

const USE_VPS = env.AUTH_BACKEND === "vps";

async function vpsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

// ─── Customer Ledger ───────────────────────────────────────
export const customerLedgerService = {
  async list(dealerId: string, customerId?: string) {
    if (USE_VPS) {
      const params = new URLSearchParams({ dealerId });
      if (customerId) params.set("customerId", customerId);
      const body = await vpsRequest<{ rows: any[] }>(`/api/ledger/customers?${params}`);
      return body.rows ?? [];
    }
    let query = supabase
      .from("customer_ledger")
      .select("*, customers(name)")
      .eq("dealer_id", dealerId)
      .order("entry_date", { ascending: false });
    if (customerId) query = query.eq("customer_id", customerId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  },

  async monthlySummary(dealerId: string, year: number) {
    if (USE_VPS) {
      const body = await vpsRequest<{ rows: any[] }>(
        `/api/ledger/customers/monthly-summary?dealerId=${dealerId}&year=${year}`,
      );
      return aggregateMonthly(body.rows ?? []);
    }
    const { data, error } = await supabase
      .from("customer_ledger")
      .select("amount, entry_date")
      .eq("dealer_id", dealerId)
      .gte("entry_date", `${year}-01-01`)
      .lte("entry_date", `${year}-12-31`);
    if (error) throw new Error(error.message);
    return aggregateMonthly(data ?? []);
  },

  async addEntry(entry: {
    dealer_id: string;
    customer_id: string;
    sale_id?: string;
    sales_return_id?: string;
    type: string;
    amount: number;
    description: string;
    entry_date?: string;
  }) {
    if (USE_VPS) {
      const { dealer_id, ...data } = entry;
      await vpsRequest(`/api/ledger/customers`, {
        method: "POST",
        body: JSON.stringify({ dealerId: dealer_id, data }),
      });
      return;
    }
    const { error } = await supabase.from("customer_ledger").insert({
      ...entry,
      entry_date: entry.entry_date ?? new Date().toISOString().split("T")[0],
    });
    if (error) throw new Error(error.message);
  },
};

// ─── Supplier Ledger ───────────────────────────────────────
export const supplierLedgerService = {
  async list(dealerId: string, supplierId?: string) {
    if (USE_VPS) {
      const params = new URLSearchParams({ dealerId });
      if (supplierId) params.set("supplierId", supplierId);
      const body = await vpsRequest<{ rows: any[] }>(`/api/ledger/suppliers?${params}`);
      return body.rows ?? [];
    }
    let query = supabase
      .from("supplier_ledger")
      .select("*, suppliers(name)")
      .eq("dealer_id", dealerId)
      .order("entry_date", { ascending: false });
    if (supplierId) query = query.eq("supplier_id", supplierId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  },

  async monthlySummary(dealerId: string, year: number) {
    if (USE_VPS) {
      const body = await vpsRequest<{ rows: any[] }>(
        `/api/ledger/suppliers/monthly-summary?dealerId=${dealerId}&year=${year}`,
      );
      return aggregateMonthly(body.rows ?? []);
    }
    const { data, error } = await supabase
      .from("supplier_ledger")
      .select("amount, entry_date")
      .eq("dealer_id", dealerId)
      .gte("entry_date", `${year}-01-01`)
      .lte("entry_date", `${year}-12-31`);
    if (error) throw new Error(error.message);
    return aggregateMonthly(data ?? []);
  },

  async addEntry(entry: {
    dealer_id: string;
    supplier_id: string;
    purchase_id?: string;
    type: string;
    amount: number;
    description: string;
    entry_date?: string;
  }) {
    if (USE_VPS) {
      const { dealer_id, ...data } = entry;
      await vpsRequest(`/api/ledger/suppliers`, {
        method: "POST",
        body: JSON.stringify({ dealerId: dealer_id, data }),
      });
      return;
    }
    const { error } = await supabase.from("supplier_ledger").insert({
      dealer_id: entry.dealer_id,
      supplier_id: entry.supplier_id,
      purchase_id: entry.purchase_id,
      type: entry.type as any,
      amount: entry.amount,
      description: entry.description,
      entry_date: entry.entry_date ?? new Date().toISOString().split("T")[0],
    });
    if (error) throw new Error(error.message);
  },
};

// ─── Cash Ledger ───────────────────────────────────────────
export const cashLedgerService = {
  async list(dealerId: string) {
    if (USE_VPS) {
      const body = await vpsRequest<{ rows: any[] }>(`/api/ledger/cash?dealerId=${dealerId}`);
      return body.rows ?? [];
    }
    const { data, error } = await supabase
      .from("cash_ledger")
      .select("*")
      .eq("dealer_id", dealerId)
      .order("entry_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async monthlySummary(dealerId: string, year: number) {
    if (USE_VPS) {
      const body = await vpsRequest<{ rows: any[] }>(
        `/api/ledger/cash/monthly-summary?dealerId=${dealerId}&year=${year}`,
      );
      return aggregateMonthly(body.rows ?? []);
    }
    const { data, error } = await supabase
      .from("cash_ledger")
      .select("amount, entry_date")
      .eq("dealer_id", dealerId)
      .gte("entry_date", `${year}-01-01`)
      .lte("entry_date", `${year}-12-31`);
    if (error) throw new Error(error.message);
    return aggregateMonthly(data ?? []);
  },

  async addEntry(entry: {
    dealer_id: string;
    type: string;
    amount: number;
    description: string;
    reference_type?: string;
    reference_id?: string;
    entry_date?: string;
  }) {
    if (USE_VPS) {
      const { dealer_id, ...data } = entry;
      await vpsRequest(`/api/ledger/cash`, {
        method: "POST",
        body: JSON.stringify({ dealerId: dealer_id, data }),
      });
      return;
    }
    const { error } = await supabase.from("cash_ledger").insert({
      dealer_id: entry.dealer_id,
      type: entry.type as any,
      amount: entry.amount,
      description: entry.description,
      reference_type: entry.reference_type,
      reference_id: entry.reference_id,
      entry_date: entry.entry_date ?? new Date().toISOString().split("T")[0],
    });
    if (error) throw new Error(error.message);
  },
};

// ─── Expense Ledger ────────────────────────────────────────
export const expenseLedgerService = {
  async list(dealerId: string) {
    if (USE_VPS) {
      const body = await vpsRequest<{ rows: any[] }>(`/api/ledger/expenses?dealerId=${dealerId}`);
      return body.rows ?? [];
    }
    const { data, error } = await supabase
      .from("expense_ledger")
      .select("*")
      .eq("dealer_id", dealerId)
      .order("entry_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async monthlySummary(dealerId: string, year: number) {
    if (USE_VPS) {
      const body = await vpsRequest<{ rows: any[] }>(
        `/api/ledger/expenses/monthly-summary?dealerId=${dealerId}&year=${year}`,
      );
      return aggregateMonthly(body.rows ?? []);
    }
    const { data, error } = await supabase
      .from("expense_ledger")
      .select("amount, entry_date")
      .eq("dealer_id", dealerId)
      .gte("entry_date", `${year}-01-01`)
      .lte("entry_date", `${year}-12-31`);
    if (error) throw new Error(error.message);
    return aggregateMonthly(data ?? []);
  },

  async addEntry(entry: {
    dealer_id: string;
    expense_id?: string;
    amount: number;
    category?: string;
    description: string;
    entry_date?: string;
  }) {
    if (USE_VPS) {
      const { dealer_id, ...data } = entry;
      await vpsRequest(`/api/ledger/expenses`, {
        method: "POST",
        body: JSON.stringify({ dealerId: dealer_id, data }),
      });
      return;
    }
    const { error } = await supabase.from("expense_ledger").insert({
      ...entry,
      entry_date: entry.entry_date ?? new Date().toISOString().split("T")[0],
    });
    if (error) throw new Error(error.message);
  },
};

// ─── Helpers ───────────────────────────────────────────────
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function aggregateMonthly(
  rows: { amount: number; entry_date: string }[]
): MonthlySummary[] {
  const buckets: Record<number, { credit: number; debit: number }> = {};
  for (let i = 0; i < 12; i++) buckets[i] = { credit: 0, debit: 0 };

  for (const row of rows) {
    const m = new Date(row.entry_date).getMonth();
    const amt = Number(row.amount);
    if (amt >= 0) buckets[m].credit += amt;
    else buckets[m].debit += Math.abs(amt);
  }

  let runningBalance = 0;
  return MONTHS.map((month, i) => {
    runningBalance += buckets[i].credit - buckets[i].debit;
    return {
      month,
      credit: Math.round(buckets[i].credit * 100) / 100,
      debit: Math.round(buckets[i].debit * 100) / 100,
      balance: Math.round(runningBalance * 100) / 100,
    };
  });
}
