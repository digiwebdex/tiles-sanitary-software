/**
 * collectionsService — VPS-aware aggregation client for the
 * Collection Tracker. Falls back to Supabase only on legacy/preview hosts.
 */
import { supabase } from "@/integrations/supabase/client";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export interface CustomerOutstandingDTO {
  id: string;
  name: string;
  phone: string | null;
  type: string;
  outstanding: number;
  last_payment_date: string | null;
  total_sales: number;
  total_paid: number;
  invoices: { invoice_number: string; sale_id: string; sale_date: string }[];
  oldestSaleDate: string | null;
  daysOverdue: number;
  agingBucket: string;
  lastFollowupDate: string | null;
  lastFollowupStatus: string | null;
  maxOverdueDays: number;
}

export interface RecentCollectionDTO {
  id: string;
  customer_name: string;
  amount: number;
  description: string | null;
  entry_date: string;
  created_at: string;
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

function getAgingBucket(daysOverdue: number): string {
  if (daysOverdue <= 30) return "current";
  if (daysOverdue <= 60) return "30+";
  if (daysOverdue <= 90) return "60+";
  return "90+";
}

export const collectionsService = {
  async listOutstanding(dealerId: string): Promise<CustomerOutstandingDTO[]> {
    if (USE_VPS) {
      const body = await vpsRequest<{ customers: CustomerOutstandingDTO[] }>(
        `/api/collections/outstanding?dealerId=${dealerId}`,
      );
      return body.customers ?? [];
    }

    // Legacy Supabase fallback (mirrors old CollectionTracker query)
    const [custRes, ledgerRes, salesRes, followupRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, phone, type, max_overdue_days")
        .eq("dealer_id", dealerId)
        .eq("status", "active")
        .order("name"),
      supabase
        .from("customer_ledger")
        .select("customer_id, amount, type, entry_date")
        .eq("dealer_id", dealerId),
      supabase
        .from("sales")
        .select("customer_id, invoice_number, sale_date, id, due_amount")
        .eq("dealer_id", dealerId)
        .order("sale_date", { ascending: false }),
      supabase
        .from("customer_followups")
        .select("customer_id, followup_date, status, created_at")
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false }),
    ]);
    if (custRes.error) throw new Error(custRes.error.message);
    if (ledgerRes.error) throw new Error(ledgerRes.error.message);
    if (salesRes.error) throw new Error(salesRes.error.message);

    const followupMap = new Map<string, { date: string; status: string }>();
    for (const f of followupRes.data ?? []) {
      if (!followupMap.has(f.customer_id)) {
        followupMap.set(f.customer_id, { date: f.followup_date, status: f.status });
      }
    }

    const invoiceMap = new Map<string, { invoice_number: string; sale_id: string; sale_date: string }[]>();
    for (const s of salesRes.data ?? []) {
      if (!s.invoice_number) continue;
      const arr = invoiceMap.get(s.customer_id) ?? [];
      arr.push({ invoice_number: s.invoice_number, sale_id: s.id, sale_date: s.sale_date });
      invoiceMap.set(s.customer_id, arr);
    }

    const oldestMap = new Map<string, string>();
    const salesAsc = [...(salesRes.data ?? [])].reverse();
    for (const s of salesAsc) {
      if (Number(s.due_amount) > 0 && !oldestMap.has(s.customer_id)) {
        oldestMap.set(s.customer_id, s.sale_date);
      }
    }

    const agg = new Map<string, { outstanding: number; total_sales: number; total_paid: number; last_payment: string | null }>();
    for (const e of ledgerRes.data ?? []) {
      const cur = agg.get(e.customer_id) ?? { outstanding: 0, total_sales: 0, total_paid: 0, last_payment: null };
      const amt = Number(e.amount);
      if (e.type === "sale") { cur.outstanding += amt; cur.total_sales += amt; }
      else if (e.type === "payment" || e.type === "refund") {
        cur.outstanding -= amt; cur.total_paid += amt;
        if (!cur.last_payment || e.entry_date > cur.last_payment) cur.last_payment = e.entry_date;
      } else if (e.type === "adjustment") {
        cur.outstanding += amt; cur.total_sales += amt;
      }
      agg.set(e.customer_id, cur);
    }

    const today = new Date();
    return (custRes.data ?? []).map((c: any) => {
      const a = agg.get(c.id) ?? { outstanding: 0, total_sales: 0, total_paid: 0, last_payment: null };
      const oldest = oldestMap.get(c.id) ?? null;
      const daysOverdue = oldest
        ? Math.max(0, Math.floor((today.getTime() - new Date(oldest).getTime()) / 86400000))
        : 0;
      const fu = followupMap.get(c.id);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        type: c.type,
        outstanding: Math.round(a.outstanding * 100) / 100,
        last_payment_date: a.last_payment,
        total_sales: Math.round(a.total_sales * 100) / 100,
        total_paid: Math.round(a.total_paid * 100) / 100,
        invoices: invoiceMap.get(c.id) ?? [],
        oldestSaleDate: oldest,
        daysOverdue,
        agingBucket: getAgingBucket(daysOverdue),
        lastFollowupDate: fu?.date ?? null,
        lastFollowupStatus: fu?.status ?? null,
        maxOverdueDays: Number(c.max_overdue_days ?? 0),
      };
    }).filter((c) => c.outstanding > 0);
  },

  async listRecent(dealerId: string, limit = 20): Promise<RecentCollectionDTO[]> {
    if (USE_VPS) {
      const body = await vpsRequest<{ rows: RecentCollectionDTO[] }>(
        `/api/collections/recent?dealerId=${dealerId}&limit=${limit}`,
      );
      return body.rows ?? [];
    }

    const { data, error } = await supabase
      .from("customer_ledger")
      .select("id, amount, description, entry_date, created_at, customer_id, customers(name)")
      .eq("dealer_id", dealerId)
      .eq("type", "payment")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      customer_name: r.customers?.name ?? "Unknown",
      amount: Number(r.amount),
      description: r.description,
      entry_date: r.entry_date,
      created_at: r.created_at,
    }));
  },
};
