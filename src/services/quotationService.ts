/**
 * Quotation service — VPS-backed (Phase 3U-16).
 *
 * All reads and writes go through /api/quotations/*.
 * Method signatures preserved for existing UI consumers.
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import type { QuotationFormInput, QuotationItemInput } from "@/modules/quotations/quotationSchema";

export type QuotationStatus =
  | "draft"
  | "active"
  | "expired"
  | "revised"
  | "converted"
  | "cancelled";

export interface Quotation {
  id: string;
  dealer_id: string;
  quotation_no: string;
  revision_no: number;
  parent_quotation_id: string | null;
  customer_id: string | null;
  customer_name_text: string | null;
  customer_phone_text: string | null;
  customer_address_text: string | null;
  status: QuotationStatus;
  quote_date: string;
  valid_until: string;
  subtotal: number;
  discount_type: "flat" | "percent";
  discount_value: number;
  total_amount: number;
  notes: string | null;
  terms_text: string | null;
  converted_sale_id: string | null;
  converted_at: string | null;
  converted_by: string | null;
  created_by: string | null;
  project_id: string | null;
  site_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuotationItem {
  id: string;
  dealer_id: string;
  quotation_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  product_sku_snapshot: string | null;
  unit_type: "box_sft" | "piece";
  per_box_sft: number | null;
  quantity: number;
  rate: number;
  discount_value: number;
  line_total: number;
  preferred_shade_code: string | null;
  preferred_caliber: string | null;
  preferred_batch_no: string | null;
  notes: string | null;
  sort_order: number;
  measurement_snapshot: Record<string, unknown> | null;
  rate_source: "default" | "tier" | "manual";
  tier_id: string | null;
  original_resolved_rate: number | null;
  created_at: string;
}

export function formatQuotationDisplayNo(q: { quotation_no: string; revision_no: number }): string {
  return q.revision_no > 0 ? `${q.quotation_no}-R${q.revision_no}` : q.quotation_no;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try { msg = JSON.parse(text).error ?? text; } catch { /* ignore */ }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, unknown>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : "";
}

export const quotationService = {
  async sweepExpired(dealerId: string): Promise<number> {
    const r = await call<{ count: number }>(
      `/api/quotations/sweep-expired${qs({ dealerId })}`,
      { method: "POST" },
    );
    return Number(r.count ?? 0);
  },

  async list(
    dealerId: string,
    opts: {
      search?: string;
      status?: QuotationStatus | "";
      page?: number;
      projectId?: string | null;
      siteId?: string | null;
    } = {},
  ) {
    const r = await call<{
      data: (Quotation & { customers: { name: string; phone: string | null } | null })[];
      total: number;
    }>(`/api/quotations${qs({
      dealerId,
      search: opts.search ?? "",
      status: opts.status ?? "",
      page: opts.page ?? 1,
      projectId: opts.projectId ?? "",
      siteId: opts.siteId ?? "",
    })}`);
    return { data: r.data ?? [], total: r.total ?? 0 };
  },

  async getById(id: string, dealerId?: string) {
    const r = await call<{
      data: Quotation & { customers: { id: string; name: string; phone: string | null; address: string | null } | null };
    }>(`/api/quotations/${id}${qs({ dealerId })}`);
    return r.data;
  },

  async listItems(quotationId: string, dealerId?: string) {
    const r = await call<{ data: QuotationItem[] }>(
      `/api/quotations/${quotationId}/items${qs({ dealerId })}`,
    );
    return r.data ?? [];
  },

  async getRevisionChain(quotation: Quotation, dealerId?: string) {
    const r = await call<{ data: Quotation[] }>(
      `/api/quotations/${quotation.id}/revisions${qs({ dealerId })}`,
    );
    return r.data ?? [];
  },

  async createDraft(dealerId: string, _userId: string | null, form: QuotationFormInput): Promise<Quotation> {
    const r = await call<{ data: Quotation }>("/api/quotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, dealerId }),
    });
    return r.data;
  },

  async _insertItems(_dealerId: string, _quotationId: string, _items: (QuotationItemInput & { line_total: number; sort_order: number })[]) {
    // Backend handles items as part of create/update; kept for signature compat.
    return;
  },

  async updateDraft(quotationId: string, dealerId: string, form: QuotationFormInput): Promise<void> {
    await call(`/api/quotations/${quotationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, dealerId }),
    });
  },

  async finalize(quotationId: string, dealerId: string): Promise<Quotation> {
    const r = await call<{ data: Quotation }>(
      `/api/quotations/${quotationId}/finalize${qs({ dealerId })}`,
      { method: "POST" },
    );
    return r.data;
  },

  async cancel(quotationId: string, dealerId?: string): Promise<void> {
    await call(`/api/quotations/${quotationId}/cancel${qs({ dealerId })}`, { method: "POST" });
  },

  async deleteDraft(quotationId: string, dealerId?: string): Promise<void> {
    await call(`/api/quotations/${quotationId}${qs({ dealerId })}`, { method: "DELETE" });
  },

  async revise(quotationId: string, dealerId: string): Promise<string> {
    const r = await call<{ data: { id: string } }>(
      `/api/quotations/${quotationId}/revise${qs({ dealerId })}`,
      { method: "POST" },
    );
    return r.data.id;
  },

  async prepareConversionPrefill(quotationId: string, dealerId: string): Promise<{
    quotation: Quotation;
    customer_name: string;
    items: Array<{ product_id: string; quantity: number; sale_rate: number }>;
    discount: number;
    notes: string;
    project_id: string | null;
    site_id: string | null;
    blockers: string[];
  }> {
    const r = await call<{ data: {
      quotation: Quotation;
      customer_name: string;
      items: Array<{ product_id: string; quantity: number; sale_rate: number }>;
      discount: number;
      notes: string;
      project_id: string | null;
      site_id: string | null;
      blockers: string[];
    } }>(
      `/api/quotations/${quotationId}/conversion-prefill${qs({ dealerId })}`,
      { method: "POST" },
    );
    return r.data;
  },

  async linkToSale(quotationId: string, saleId: string, dealerId: string): Promise<void> {
    await call(`/api/quotations/${quotationId}/link-to-sale`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saleId, dealerId }),
    });
  },
};
