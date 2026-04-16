import { supabase } from "@/integrations/supabase/client";
import type { QuotationFormInput, QuotationItemInput } from "@/modules/quotations/quotationSchema";

// Types for `quotations` / `quotation_items` are now in generated types.ts.
// We still alias to a loose handle for ergonomic chained queries.
const sb = supabase;

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
  created_at: string;
}

const PAGE_SIZE = 25;

/** Display number = base + revision suffix (e.g. Q-00001-R2). */
export function formatQuotationDisplayNo(q: { quotation_no: string; revision_no: number }): string {
  return q.revision_no > 0 ? `${q.quotation_no}-R${q.revision_no}` : q.quotation_no;
}

function calcLineTotal(it: QuotationItemInput): number {
  const gross = Number(it.quantity || 0) * Number(it.rate || 0);
  const disc = Number(it.discount_value || 0);
  return Math.max(0, gross - disc);
}

function calcTotals(items: QuotationItemInput[], discountType: "flat" | "percent", discountValue: number) {
  const subtotal = items.reduce((s, it) => s + calcLineTotal(it), 0);
  const discountAmount =
    discountType === "percent" ? (subtotal * Number(discountValue || 0)) / 100 : Number(discountValue || 0);
  const total = Math.max(0, subtotal - discountAmount);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    total_amount: Math.round(total * 100) / 100,
  };
}

export const quotationService = {
  /** Auto-mark active quotes past validity as expired (cheap upsert RPC). */
  async sweepExpired(dealerId: string): Promise<number> {
    const { data, error } = await sb.rpc("expire_stale_quotations", { _dealer_id: dealerId });
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  },

  async list(dealerId: string, opts: { search?: string; status?: QuotationStatus | ""; page?: number } = {}) {
    const { search = "", status = "", page = 1 } = opts;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Auto-expire on view (silent)
    try { await this.sweepExpired(dealerId); } catch { /* non-fatal */ }

    let query = sb
      .from("quotations")
      .select("*, customers(name, phone)", { count: "exact" })
      .eq("dealer_id", dealerId)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (search.trim()) {
      const s = search.trim();
      query = query.or(`quotation_no.ilike.%${s}%,customer_name_text.ilike.%${s}%`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw new Error(error.message);
    return { data: (data ?? []) as (Quotation & { customers: { name: string; phone: string | null } | null })[], total: count ?? 0 };
  },

  async getById(id: string) {
    const { data, error } = await sb
      .from("quotations")
      .select("*, customers(id, name, phone, address)")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data as Quotation & { customers: { id: string; name: string; phone: string | null; address: string | null } | null };
  },

  async listItems(quotationId: string) {
    const { data, error } = await sb
      .from("quotation_items")
      .select("*")
      .eq("quotation_id", quotationId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as QuotationItem[];
  },

  /** Get full revision chain (root + all descendants) ordered by revision_no. */
  async getRevisionChain(quotation: Quotation) {
    let rootId = quotation.id;
    if (quotation.parent_quotation_id) {
      // climb to root
      let cur = quotation;
      while (cur.parent_quotation_id) {
        const { data, error } = await sb.from("quotations").select("*").eq("id", cur.parent_quotation_id).single();
        if (error || !data) break;
        cur = data as Quotation;
      }
      rootId = cur.id;
    }
    const { data, error } = await sb
      .from("quotations")
      .select("*")
      .or(`id.eq.${rootId},parent_quotation_id.eq.${rootId}`)
      .order("revision_no", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Quotation[];
  },

  /** Create as draft (no number assigned). */
  async createDraft(dealerId: string, userId: string | null, form: QuotationFormInput): Promise<Quotation> {
    const items = form.items.map((it, idx) => ({
      ...it,
      line_total: calcLineTotal(it),
      sort_order: idx,
    }));
    const totals = calcTotals(items, form.discount_type, form.discount_value);

    // Insert quotation with placeholder no = "DRAFT-<timestamp>"
    const draftNo = `DRAFT-${Date.now()}`;
    const { data: q, error } = await sb
      .from("quotations")
      .insert({
        dealer_id: dealerId,
        quotation_no: draftNo,
        revision_no: 0,
        parent_quotation_id: null,
        customer_id: form.customer_id || null,
        customer_name_text: form.customer_name_text?.trim() || null,
        customer_phone_text: form.customer_phone_text?.trim() || null,
        customer_address_text: form.customer_address_text?.trim() || null,
        status: "draft",
        quote_date: form.quote_date,
        valid_until: form.valid_until,
        subtotal: totals.subtotal,
        discount_type: form.discount_type,
        discount_value: form.discount_value,
        total_amount: totals.total_amount,
        notes: form.notes?.trim() || null,
        terms_text: form.terms_text?.trim() || null,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await this._insertItems(dealerId, q.id, items);
    return q as Quotation;
  },

  async _insertItems(dealerId: string, quotationId: string, items: (QuotationItemInput & { line_total: number; sort_order: number })[]) {
    if (items.length === 0) return;
    const rows = items.map((it) => ({
      dealer_id: dealerId,
      quotation_id: quotationId,
      product_id: it.product_id || null,
      product_name_snapshot: it.product_name_snapshot,
      product_sku_snapshot: it.product_sku_snapshot || null,
      unit_type: it.unit_type,
      per_box_sft: it.per_box_sft ?? null,
      quantity: it.quantity,
      rate: it.rate,
      discount_value: it.discount_value || 0,
      line_total: it.line_total,
      preferred_shade_code: it.preferred_shade_code || null,
      preferred_caliber: it.preferred_caliber || null,
      preferred_batch_no: it.preferred_batch_no || null,
      notes: it.notes || null,
      sort_order: it.sort_order,
    }));
    const { error } = await sb.from("quotation_items").insert(rows);
    if (error) throw new Error(error.message);
  },

  /** Update a draft (header + replace items). */
  async updateDraft(quotationId: string, dealerId: string, form: QuotationFormInput): Promise<void> {
    const items = form.items.map((it, idx) => ({
      ...it,
      line_total: calcLineTotal(it),
      sort_order: idx,
    }));
    const totals = calcTotals(items, form.discount_type, form.discount_value);

    const { error: upErr } = await sb
      .from("quotations")
      .update({
        customer_id: form.customer_id || null,
        customer_name_text: form.customer_name_text?.trim() || null,
        customer_phone_text: form.customer_phone_text?.trim() || null,
        customer_address_text: form.customer_address_text?.trim() || null,
        quote_date: form.quote_date,
        valid_until: form.valid_until,
        subtotal: totals.subtotal,
        discount_type: form.discount_type,
        discount_value: form.discount_value,
        total_amount: totals.total_amount,
        notes: form.notes?.trim() || null,
        terms_text: form.terms_text?.trim() || null,
      })
      .eq("id", quotationId);
    if (upErr) throw new Error(upErr.message);

    // Replace items
    const { error: delErr } = await sb.from("quotation_items").delete().eq("quotation_id", quotationId);
    if (delErr) throw new Error(delErr.message);
    await this._insertItems(dealerId, quotationId, items);
  },

  /** Move from draft → active and assign a real Q-00001 number. */
  async finalize(quotationId: string, dealerId: string): Promise<Quotation> {
    const { data: numData, error: numErr } = await sb.rpc("generate_next_quotation_no", { _dealer_id: dealerId });
    if (numErr) throw new Error(numErr.message);
    const newNo = String(numData);

    const { data, error } = await sb
      .from("quotations")
      .update({ status: "active", quotation_no: newNo })
      .eq("id", quotationId)
      .eq("status", "draft")
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Only draft quotations can be finalized.");
    return data as Quotation;
  },

  /** Cancel a draft or active quotation. */
  async cancel(quotationId: string): Promise<void> {
    const { data, error } = await sb
      .from("quotations")
      .update({ status: "cancelled" })
      .eq("id", quotationId)
      .in("status", ["draft", "active", "expired"])
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Quotation cannot be cancelled in its current state.");
  },

  /** Hard delete a draft (only). Active/finalized quotes must be cancelled, not deleted. */
  async deleteDraft(quotationId: string): Promise<void> {
    const { error } = await sb.from("quotations").delete().eq("id", quotationId).eq("status", "draft");
    if (error) throw new Error(error.message);
  },

  /**
   * Revise an active or expired quotation.
   * Marks the parent as `revised` and creates a new active row with revision_no+1
   * sharing the same base quotation_no and pointing to the root via parent_quotation_id.
   * Returns the new quotation id.
   */
  async revise(quotationId: string, dealerId: string): Promise<string> {
    const { data, error } = await sb.rpc("revise_quotation", {
      _quotation_id: quotationId,
      _dealer_id: dealerId,
    });
    if (error) throw new Error(error.message);
    return String(data);
  },

  /**
   * Validate a quotation before conversion. Re-checks:
   *  - status must be 'active'
   *  - every item must have a product_id (custom lines block conversion)
   *  - every product must still exist and be active
   * Returns prefill payload for SaleForm on success; throws with a friendly message on failure.
   */
  async prepareConversionPrefill(quotationId: string, dealerId: string): Promise<{
    quotation: Quotation;
    customer_name: string;
    items: Array<{ product_id: string; quantity: number; sale_rate: number }>;
    discount: number;
    notes: string;
    blockers: string[];
  }> {
    const quote = await this.getById(quotationId);
    const items = await this.listItems(quotationId);

    const blockers: string[] = [];
    if (quote.dealer_id !== dealerId) blockers.push("Quotation belongs to a different dealer.");
    if (quote.status !== "active") blockers.push(`Quotation is ${quote.status} — only active quotes can be converted.`);

    // Custom lines (no product_id) cannot be converted directly
    const customLines = items.filter((it) => !it.product_id);
    if (customLines.length > 0) {
      blockers.push(`${customLines.length} custom line(s) without a product link. Revise the quote and pick real products.`);
    }

    // Validate live products
    const productIds = items.map((it) => it.product_id).filter(Boolean) as string[];
    if (productIds.length > 0) {
      const { data: prods, error } = await sb
        .from("products")
        .select("id, name, active")
        .eq("dealer_id", dealerId)
        .in("id", productIds);
      if (error) throw new Error(error.message);
      const liveMap = new Map((prods ?? []).map((p) => [p.id, p]));
      for (const it of items) {
        if (!it.product_id) continue;
        const p = liveMap.get(it.product_id);
        if (!p) {
          blockers.push(`Product "${it.product_name_snapshot}" no longer exists. Revise to replace it.`);
        } else if (!p.active) {
          blockers.push(`Product "${p.name}" is inactive. Revise to replace it.`);
        }
      }
    }

    const customerName =
      quote.customers?.name?.trim() ||
      quote.customer_name_text?.trim() ||
      "";

    if (!customerName) {
      blockers.push("Quotation has no customer name. Revise and add one.");
    }

    // Build sale-form items (1 row per quote line). For box_sft products SaleForm
    // multiplies by per_box_sft internally, so we pass quantity as box-count.
    const saleItems = items
      .filter((it) => !!it.product_id)
      .map((it) => ({
        product_id: it.product_id!,
        quantity: Number(it.quantity ?? 0),
        sale_rate: Number(it.rate ?? 0),
      }));

    // Compute total discount amount from the quote header
    const discountAmount =
      quote.discount_type === "percent"
        ? Math.round((Number(quote.subtotal) * Number(quote.discount_value)) / 100 * 100) / 100
        : Number(quote.discount_value);

    return {
      quotation: quote,
      customer_name: customerName,
      items: saleItems,
      discount: discountAmount,
      notes: [quote.notes, `From quotation ${formatQuotationDisplayNo(quote)}`].filter(Boolean).join(" · "),
      blockers,
    };
  },

  /** Mark quote as converted and link the new sale id (called after sale insert). */
  async linkToSale(quotationId: string, saleId: string, dealerId: string): Promise<void> {
    const { error } = await sb.rpc("link_quotation_to_sale", {
      _quotation_id: quotationId,
      _sale_id: saleId,
      _dealer_id: dealerId,
    });
    if (error) throw new Error(error.message);
  },
};
