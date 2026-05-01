/**
 * ledgerService — VPS-only.
 *
 * All reads/writes go through /api/ledger/{customers|suppliers|cash|expenses}.
 */
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
    const params = new URLSearchParams({ dealerId });
    if (customerId) params.set("customerId", customerId);
    const body = await vpsRequest<{ rows: any[] }>(`/api/ledger/customers?${params}`);
    return body.rows ?? [];
  },

  async monthlySummary(dealerId: string, year: number) {
    const body = await vpsRequest<{ rows: any[] }>(
      `/api/ledger/customers/monthly-summary?dealerId=${dealerId}&year=${year}`,
    );
    return aggregateMonthly(body.rows ?? []);
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
    const { dealer_id, ...data } = entry;
    await vpsRequest(`/api/ledger/customers`, {
      method: "POST",
      body: JSON.stringify({ dealerId: dealer_id, data }),
    });
  },
};

// ─── Supplier Ledger ───────────────────────────────────────
export const supplierLedgerService = {
  async list(dealerId: string, supplierId?: string) {
    const params = new URLSearchParams({ dealerId });
    if (supplierId) params.set("supplierId", supplierId);
    const body = await vpsRequest<{ rows: any[] }>(`/api/ledger/suppliers?${params}`);
    return body.rows ?? [];
  },

  async monthlySummary(dealerId: string, year: number) {
    const body = await vpsRequest<{ rows: any[] }>(
      `/api/ledger/suppliers/monthly-summary?dealerId=${dealerId}&year=${year}`,
    );
    return aggregateMonthly(body.rows ?? []);
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
    const { dealer_id, ...data } = entry;
    await vpsRequest(`/api/ledger/suppliers`, {
      method: "POST",
      body: JSON.stringify({ dealerId: dealer_id, data }),
    });
  },
};

// ─── Cash Ledger ───────────────────────────────────────────
export const cashLedgerService = {
  async list(dealerId: string) {
    const body = await vpsRequest<{ rows: any[] }>(`/api/ledger/cash?dealerId=${dealerId}`);
    return body.rows ?? [];
  },

  async monthlySummary(dealerId: string, year: number) {
    const body = await vpsRequest<{ rows: any[] }>(
      `/api/ledger/cash/monthly-summary?dealerId=${dealerId}&year=${year}`,
    );
    return aggregateMonthly(body.rows ?? []);
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
    const { dealer_id, ...data } = entry;
    await vpsRequest(`/api/ledger/cash`, {
      method: "POST",
      body: JSON.stringify({ dealerId: dealer_id, data }),
    });
  },
};

// ─── Expense Ledger ────────────────────────────────────────
export const expenseLedgerService = {
  async list(dealerId: string) {
    const body = await vpsRequest<{ rows: any[] }>(`/api/ledger/expenses?dealerId=${dealerId}`);
    return body.rows ?? [];
  },

  async monthlySummary(dealerId: string, year: number) {
    const body = await vpsRequest<{ rows: any[] }>(
      `/api/ledger/expenses/monthly-summary?dealerId=${dealerId}&year=${year}`,
    );
    return aggregateMonthly(body.rows ?? []);
  },

  async addEntry(entry: {
    dealer_id: string;
    expense_id?: string;
    amount: number;
    category?: string;
    description: string;
    entry_date?: string;
  }) {
    const { dealer_id, ...data } = entry;
    await vpsRequest(`/api/ledger/expenses`, {
      method: "POST",
      body: JSON.stringify({ dealerId: dealer_id, data }),
    });
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
