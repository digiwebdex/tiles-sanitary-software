import { supabase } from "@/integrations/supabase/client";
import { stockService } from "@/services/stockService";
import { supplierLedgerService, cashLedgerService } from "@/services/ledgerService";
import { logAudit } from "@/services/auditService";
import { assertDealerId } from "@/lib/tenancy";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

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

export interface PurchaseReturnItemInput {
  product_id: string;
  quantity: number;
  unit_price: number;
  reason?: string;
}

export interface CreatePurchaseReturnInput {
  dealer_id: string;
  purchase_id?: string;
  supplier_id: string;
  return_date: string;
  return_no: string;
  notes?: string;
  created_by?: string;
  items: PurchaseReturnItemInput[];
}

const PAGE_SIZE = 25;

export const purchaseReturnService = {
  async list(dealerId: string, page = 1) {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabase
      .from("purchase_returns")
      .select("*, suppliers(name)", { count: "exact" })
      .eq("dealer_id", dealerId)
      .order("return_date", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    return { data: data ?? [], total: count ?? 0 };
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from("purchase_returns")
      .select("*, suppliers(name), purchase_return_items(*, products(name, sku, unit_type, per_box_sft))")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async getNextReturnNo(dealerId: string): Promise<string> {
    if (USE_VPS) {
      const body = await vpsRequest<{ next_no: string }>(
        `/api/returns/purchases/next-no?dealerId=${encodeURIComponent(dealerId)}`,
      );
      return body.next_no;
    }
    const { count } = await supabase
      .from("purchase_returns")
      .select("id", { count: "exact", head: true })
      .eq("dealer_id", dealerId);
    return `PR-${String((count ?? 0) + 1).padStart(4, "0")}`;
  },

  async create(input: CreatePurchaseReturnInput) {
    await assertDealerId(input.dealer_id);

    // ── VPS path: single atomic call ──
    if (USE_VPS) {
      return await vpsRequest<any>(`/api/returns/purchases`, {
        method: "POST",
        body: JSON.stringify({
          dealer_id: input.dealer_id,
          supplier_id: input.supplier_id,
          purchase_id: input.purchase_id || null,
          return_date: input.return_date,
          return_no: input.return_no,
          notes: input.notes ?? null,
          items: input.items,
        }),
      });
    }

    // ── Legacy Supabase path ──
    const itemsWithCalc = input.items.map((item) => ({
      ...item,
      total: item.quantity * item.unit_price,
    }));

    const totalAmount = itemsWithCalc.reduce((s, i) => s + i.total, 0);

    // Insert header
    const { data: returnRecord, error: hErr } = await supabase
      .from("purchase_returns")
      .insert({
        dealer_id: input.dealer_id,
        purchase_id: input.purchase_id || null,
        supplier_id: input.supplier_id,
        return_date: input.return_date,
        return_no: input.return_no,
        total_amount: totalAmount,
        notes: input.notes || null,
        status: "completed",
        created_by: input.created_by || null,
      } as any)
      .select()
      .single();
    if (hErr) throw new Error(hErr.message);

    // Insert items
    const itemRows = itemsWithCalc.map((item) => ({
      purchase_return_id: returnRecord!.id,
      dealer_id: input.dealer_id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total,
      reason: item.reason || null,
    }));

    const { error: iErr } = await supabase.from("purchase_return_items").insert(itemRows as any);
    if (iErr) throw new Error(iErr.message);

    // Deduct stock for returned items
    for (const item of itemsWithCalc) {
      await stockService.deductStock(item.product_id, item.quantity, input.dealer_id);
    }

    // Supplier ledger — reduce payable (we get credit back)
    await supplierLedgerService.addEntry({
      dealer_id: input.dealer_id,
      supplier_id: input.supplier_id,
      type: "refund",
      amount: totalAmount,
      description: `Purchase Return ${input.return_no}`,
      entry_date: input.return_date,
    });

    // Cash ledger — record cash inflow
    await cashLedgerService.addEntry({
      dealer_id: input.dealer_id,
      type: "refund",
      amount: totalAmount,
      description: `Purchase Return: ${input.return_no}`,
      reference_type: "purchase_returns",
      reference_id: returnRecord!.id,
      entry_date: input.return_date,
    });

    // Audit
    await logAudit({
      dealer_id: input.dealer_id,
      user_id: input.created_by,
      action: "purchase_return_create",
      table_name: "purchase_returns",
      record_id: returnRecord!.id,
      new_data: {
        supplier_id: input.supplier_id,
        return_no: input.return_no,
        total_amount: totalAmount,
        item_count: input.items.length,
      },
    });

    return returnRecord;
  },
};
