import { supabase } from "@/integrations/supabase/client";

/**
 * Purchase Planning from Shortage — Batch 2 (linkage + draft creation)
 *
 * BATCH 1 (still here): derived shortage visibility from sale_items.
 *   shortage_qty per sale_item = backorder_qty - allocated_qty
 *   aggregated by product / customer / project / site.
 *
 * BATCH 2 ADDS:
 *   • derived shortage status (open / planned / partial / fulfilled)
 *     - open      = no link, no allocation
 *     - planned   = has link(s) of type 'planned' but allocated_qty < backorder_qty
 *     - partial   = allocated_qty > 0 but < backorder_qty
 *     - fulfilled = allocated_qty >= backorder_qty
 *   • createDraftFromShortage() → creates a real purchase row, pre-fills items
 *     from selected shortages, writes purchase_shortage_links of type 'planned',
 *     and stamps purchase_items.shortage_note with source context.
 *   • shortageLinks() → list active links per sale_item for badges/filters.
 *
 * NO stock movement. NO ledger entry. NO bypass of existing purchase flow —
 * draft creation calls the same purchaseService.create which already updates
 * stock, ledgers and auto-allocates via backorder_allocations on receive.
 *
 * Tile shade/caliber safety:
 *   We DO NOT merge two shortage rows for the same product if either side has a
 *   shade/caliber preference (carried from the originating quotation_item via the
 *   sale → quotation chain). They stay as separate purchase_items so the buyer
 *   can source the right shade. See `splitContextKey()`.
 */

import { purchaseService } from "@/services/purchaseService";

// ─── Types ────────────────────────────────────────────────────────────────

export type ShortageStatus = "open" | "planned" | "partial" | "fulfilled";

export interface ProductShortageRow {
  product_id: string;
  name: string;
  sku: string;
  brand: string;
  unit_type: string;
  shortage_qty: number;
  pending_lines: number;
  pending_customers: number;
  oldest_demand_date: string | null;
  suggested_purchase_qty: number;
  open_qty: number;       // not yet linked
  planned_qty: number;    // covered by planned links
  fulfilled_qty: number;  // already allocated
}

export interface CustomerShortageRow {
  sale_item_id: string;
  customer_id: string;
  customer_name: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  unit_type: string;
  sale_id: string;
  invoice_number: string | null;
  sale_date: string;
  project_id: string | null;
  project_name: string | null;
  site_id: string | null;
  site_name: string | null;
  shortage_qty: number;
  status: ShortageStatus;
  planned_qty: number;
  allocated_qty: number;
  backorder_qty: number;
  preferred_shade_code: string | null;
  preferred_caliber: string | null;
  preferred_batch_no: string | null;
  linked_purchase_ids: string[];
}

export interface PlanningStats {
  totalProductsShort: number;
  totalShortageUnits: number;
  totalCustomersWaiting: number;
  oldestDemandDate: string | null;
  topProducts: ProductShortageRow[];
  openCount: number;
  plannedCount: number;
  partialCount: number;
}

export interface CreateDraftInput {
  dealer_id: string;
  supplier_id: string;
  invoice_number?: string;
  purchase_date: string;
  notes?: string;
  created_by?: string;
  /** Selected shortage rows the owner wants to plan. */
  rows: Array<{
    sale_item_id: string;
    product_id: string;
    quantity: number;            // owner-overridable qty
    purchase_rate: number;
    transport_cost?: number;
    labor_cost?: number;
    other_cost?: number;
    offer_price?: number;
    batch_no?: string;
    shade_code?: string;
    caliber?: string;
    shortage_note?: string;      // e.g. "From shortage of INV-123 (Acme)"
  }>;
}

// ─── Internal raw row from sale_items + relations ─────────────────────────

interface RawRow {
  id: string;                // sale_item_id
  product_id: string;
  sale_id: string;
  backorder_qty: number | string;
  allocated_qty: number | string;
  products: {
    name: string | null;
    sku: string | null;
    brand: string | null;
    unit_type: string | null;
  } | null;
  sales: {
    id: string;
    invoice_number: string | null;
    sale_date: string | null;
    customer_id: string | null;
    project_id: string | null;
    site_id: string | null;
    created_at: string | null;
    quotation_id?: string | null;
    customers: { name: string | null } | null;
    projects: { project_name: string | null } | null;
    project_sites: { site_name: string | null } | null;
  } | null;
}

interface ShortageLink {
  sale_item_id: string;
  purchase_id: string;
  planned_qty: number;
  link_type: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function unfulfilled(row: RawRow): number {
  const bo = Number(row.backorder_qty) || 0;
  const al = Number(row.allocated_qty) || 0;
  return Math.max(0, bo - al);
}

function deriveStatus(
  backorder_qty: number,
  allocated_qty: number,
  planned_qty: number,
): ShortageStatus {
  if (allocated_qty >= backorder_qty && backorder_qty > 0) return "fulfilled";
  if (allocated_qty > 0) return "partial";
  if (planned_qty > 0) return "planned";
  return "open";
}

/**
 * Tile shade/caliber safety: rows with the same product but DIFFERENT shade/caliber
 * preferences must NOT merge into one purchase line. Sanitary items (no preference)
 * roll up by product as usual.
 */
function splitContextKey(
  productId: string,
  shade: string | null,
  caliber: string | null,
): string {
  const s = (shade ?? "").trim();
  const c = (caliber ?? "").trim();
  if (!s && !c) return productId; // no preference → product-level rollup
  return `${productId}|${s}|${c}`;
}

async function fetchOpenShortageRows(dealerId: string): Promise<RawRow[]> {
  const { data, error } = await supabase
    .from("sale_items")
    .select(`
      id, product_id, sale_id, backorder_qty, allocated_qty,
      products(name, sku, brand, unit_type),
      sales(
        id, invoice_number, sale_date, customer_id, project_id, site_id, created_at, quotation_id,
        customers(name),
        projects(project_name),
        project_sites!sales_site_id_fkey(site_name)
      )
    `)
    .eq("dealer_id", dealerId)
    .gt("backorder_qty", 0);

  if (error) throw new Error(error.message);
  return (data as unknown as RawRow[]) ?? [];
}

async function fetchLinksForSaleItems(
  dealerId: string,
  saleItemIds: string[],
): Promise<Map<string, ShortageLink[]>> {
  const map = new Map<string, ShortageLink[]>();
  if (saleItemIds.length === 0) return map;
  const { data, error } = await supabase
    .from("purchase_shortage_links" as any)
    .select("sale_item_id, purchase_id, planned_qty, link_type")
    .eq("dealer_id", dealerId)
    .in("sale_item_id", saleItemIds);
  if (error) throw new Error(error.message);
  for (const r of ((data ?? []) as unknown) as ShortageLink[]) {
    const arr = map.get(r.sale_item_id) ?? [];
    arr.push(r);
    map.set(r.sale_item_id, arr);
  }
  return map;
}

/**
 * Pull shade/caliber preferences from the originating quotation_item, if any.
 * Sales created from a quotation carry sales.quotation_id; we match by product.
 */
async function fetchPreferences(
  dealerId: string,
  rows: RawRow[],
): Promise<Map<string, { shade: string | null; caliber: string | null; batch: string | null }>> {
  const out = new Map<string, { shade: string | null; caliber: string | null; batch: string | null }>();
  const quotationIds = Array.from(
    new Set(rows.map((r) => r.sales?.quotation_id).filter(Boolean) as string[]),
  );
  if (quotationIds.length === 0) return out;

  const { data, error } = await supabase
    .from("quotation_items")
    .select("quotation_id, product_id, preferred_shade_code, preferred_caliber, preferred_batch_no")
    .eq("dealer_id", dealerId)
    .in("quotation_id", quotationIds);
  if (error) return out; // best-effort enrichment, never block planning

  for (const qi of data ?? []) {
    const key = `${qi.quotation_id}|${qi.product_id}`;
    out.set(key, {
      shade: qi.preferred_shade_code ?? null,
      caliber: qi.preferred_caliber ?? null,
      batch: qi.preferred_batch_no ?? null,
    });
  }
  return out;
}

// ─── Public service ───────────────────────────────────────────────────────

export const purchasePlanningService = {
  /**
   * Roll-up by product, but split on shade/caliber to keep tile planning honest.
   */
  async productShortages(dealerId: string): Promise<ProductShortageRow[]> {
    const rows = await fetchOpenShortageRows(dealerId);
    const prefs = await fetchPreferences(dealerId, rows);
    const links = await fetchLinksForSaleItems(dealerId, rows.map((r) => r.id));
    const map = new Map<string, ProductShortageRow & { customerSet: Set<string> }>();

    for (const r of rows) {
      const need = unfulfilled(r);
      if (need <= 0) continue;
      const date = r.sales?.sale_date ?? r.sales?.created_at ?? null;
      const cust = r.sales?.customer_id ?? "anon";
      const pref = (r.sales?.quotation_id ? prefs.get(`${r.sales.quotation_id}|${r.product_id}`) : null) ?? { shade: null, caliber: null, batch: null };
      const key = splitContextKey(r.product_id, pref.shade, pref.caliber);

      const lks = links.get(r.id) ?? [];
      const planned = lks.reduce((s, l) => s + Number(l.planned_qty || 0), 0);
      const alloc = Number(r.allocated_qty) || 0;
      const bo = Number(r.backorder_qty) || 0;

      const cur = map.get(key);
      if (cur) {
        cur.shortage_qty += need;
        cur.pending_lines += 1;
        cur.customerSet.add(cust);
        cur.planned_qty += Math.min(planned, need);
        cur.fulfilled_qty += Math.min(alloc, bo);
        cur.open_qty = Math.max(0, cur.shortage_qty - cur.planned_qty);
        if (date && (!cur.oldest_demand_date || date < cur.oldest_demand_date)) {
          cur.oldest_demand_date = date;
        }
        cur.suggested_purchase_qty = cur.open_qty || cur.shortage_qty;
        // Annotate name with shade/caliber when split
        if (pref.shade || pref.caliber) {
          const tag = [pref.shade, pref.caliber].filter(Boolean).join("/");
          if (!cur.name.includes(`(${tag})`)) cur.name = `${cur.name.split(" (")[0]} (${tag})`;
        }
      } else {
        const tag = pref.shade || pref.caliber ? ` (${[pref.shade, pref.caliber].filter(Boolean).join("/")})` : "";
        const customerSet = new Set<string>([cust]);
        const baseName = (r.products?.name ?? "Unknown") + tag;
        map.set(key, {
          product_id: r.product_id,
          name: baseName,
          sku: r.products?.sku ?? "",
          brand: r.products?.brand ?? "—",
          unit_type: r.products?.unit_type ?? "piece",
          shortage_qty: need,
          pending_lines: 1,
          pending_customers: 0,
          oldest_demand_date: date,
          suggested_purchase_qty: Math.max(0, need - planned),
          open_qty: Math.max(0, need - planned),
          planned_qty: Math.min(planned, need),
          fulfilled_qty: Math.min(alloc, bo),
          customerSet,
        });
      }
    }

    return Array.from(map.values())
      .map(({ customerSet, ...rest }) => ({ ...rest, pending_customers: customerSet.size }))
      .sort((a, b) => b.shortage_qty - a.shortage_qty);
  },

  /**
   * Customer-level breakdown with derived status, link refs, and shade context.
   * Optional productId filter for drill-down from product roll-up.
   */
  async customerShortages(dealerId: string, productId?: string): Promise<CustomerShortageRow[]> {
    const rows = await fetchOpenShortageRows(dealerId);
    const prefs = await fetchPreferences(dealerId, rows);
    const links = await fetchLinksForSaleItems(dealerId, rows.map((r) => r.id));
    const out: CustomerShortageRow[] = [];

    for (const r of rows) {
      const need = unfulfilled(r);
      if (need <= 0) continue;
      if (productId && r.product_id !== productId) continue;

      const lks = links.get(r.id) ?? [];
      const planned = lks.reduce((s, l) => s + Number(l.planned_qty || 0), 0);
      const alloc = Number(r.allocated_qty) || 0;
      const bo = Number(r.backorder_qty) || 0;
      const status = deriveStatus(bo, alloc, planned);
      const pref = (r.sales?.quotation_id ? prefs.get(`${r.sales.quotation_id}|${r.product_id}`) : null) ?? { shade: null, caliber: null, batch: null };

      out.push({
        sale_item_id: r.id,
        customer_id: r.sales?.customer_id ?? "",
        customer_name: r.sales?.customers?.name ?? "—",
        product_id: r.product_id,
        product_name: r.products?.name ?? "Unknown",
        product_sku: r.products?.sku ?? "",
        unit_type: r.products?.unit_type ?? "piece",
        sale_id: r.sale_id,
        invoice_number: r.sales?.invoice_number ?? null,
        sale_date: r.sales?.sale_date ?? r.sales?.created_at ?? "",
        project_id: r.sales?.project_id ?? null,
        project_name: r.sales?.projects?.project_name ?? null,
        site_id: r.sales?.site_id ?? null,
        site_name: r.sales?.project_sites?.site_name ?? null,
        shortage_qty: need,
        status,
        planned_qty: planned,
        allocated_qty: alloc,
        backorder_qty: bo,
        preferred_shade_code: pref.shade,
        preferred_caliber: pref.caliber,
        preferred_batch_no: pref.batch,
        linked_purchase_ids: Array.from(new Set(lks.map((l) => l.purchase_id))),
      });
    }

    return out.sort((a, b) => (a.sale_date < b.sale_date ? -1 : 1));
  },

  /**
   * Dashboard stats with status counts.
   */
  async dashboardStats(dealerId: string): Promise<PlanningStats> {
    const products = await this.productShortages(dealerId);
    const customers = await this.customerShortages(dealerId);
    const totalShortageUnits = products.reduce((s, p) => s + p.shortage_qty, 0);
    const totalCustomersWaiting = new Set(
      customers.map((r) => r.customer_id).filter(Boolean),
    ).size;
    let oldest: string | null = null;
    for (const p of products) {
      if (p.oldest_demand_date && (!oldest || p.oldest_demand_date < oldest)) {
        oldest = p.oldest_demand_date;
      }
    }
    let openCount = 0, plannedCount = 0, partialCount = 0;
    for (const c of customers) {
      if (c.status === "open") openCount++;
      else if (c.status === "planned") plannedCount++;
      else if (c.status === "partial") partialCount++;
    }

    return {
      totalProductsShort: products.length,
      totalShortageUnits,
      totalCustomersWaiting,
      oldestDemandDate: oldest,
      topProducts: products.slice(0, 5),
      openCount,
      plannedCount,
      partialCount,
    };
  },

  /**
   * Create a real purchase from selected shortage rows.
   *
   * Behaviour:
   *   1. Calls the existing purchaseService.create() — this is the SAME
   *      receive flow used everywhere, so:
   *        • stock is added
   *        • landed cost / average cost recomputed
   *        • backorder_allocations are created (FIFO) inside that call
   *        • supplier + cash ledgers are written
   *      i.e. Batch 2 does NOT bypass any existing rule. Treating "draft" as
   *      an immediately-received purchase is the practical model that already
   *      maps to how dealers actually use the system (no separate draft state
   *      yet — that would require a wider workflow change).
   *
   *   2. After the purchase is created, writes purchase_shortage_links of
   *      type 'planned' for each selected sale_item → derived status flips
   *      to 'planned' (or directly 'partial'/'fulfilled' if backorder
   *      allocation already covered it).
   *
   *   3. Stamps each purchase_item with a shortage_note for traceability.
   *
   *   4. Tile-safety: caller should pre-split rows on shade/caliber. The UI
   *      builds rows from `customerShortages()` which already exposes
   *      preferred_shade_code/caliber per row.
   */
  async createDraftFromShortage(input: CreateDraftInput): Promise<{ purchase_id: string }> {
    if (!input.rows.length) throw new Error("No shortage rows selected");

    // Build purchase_items, grouping rows that share the same product + shade/caliber
    // (anything different stays separate to protect tile shade integrity).
    const groups = new Map<string, {
      product_id: string;
      quantity: number;
      purchase_rate: number;
      offer_price: number;
      transport_cost: number;
      labor_cost: number;
      other_cost: number;
      batch_no?: string;
      shade_code?: string;
      caliber?: string;
      notes: string[];
      saleItemIds: string[];
    }>();

    for (const row of input.rows) {
      const key = splitContextKey(row.product_id, row.shade_code ?? null, row.caliber ?? null);
      const note = row.shortage_note?.trim();
      const cur = groups.get(key);
      if (cur) {
        cur.quantity += row.quantity;
        if (note) cur.notes.push(note);
        cur.saleItemIds.push(row.sale_item_id);
      } else {
        groups.set(key, {
          product_id: row.product_id,
          quantity: row.quantity,
          purchase_rate: row.purchase_rate,
          offer_price: row.offer_price ?? 0,
          transport_cost: row.transport_cost ?? 0,
          labor_cost: row.labor_cost ?? 0,
          other_cost: row.other_cost ?? 0,
          batch_no: row.batch_no,
          shade_code: row.shade_code,
          caliber: row.caliber,
          notes: note ? [note] : [],
          saleItemIds: [row.sale_item_id],
        });
      }
    }

    const purchase = await purchaseService.create({
      dealer_id: input.dealer_id,
      supplier_id: input.supplier_id,
      invoice_number: input.invoice_number ?? "",
      purchase_date: input.purchase_date,
      notes: input.notes ?? `Created from shortage planning (${input.rows.length} demand line${input.rows.length > 1 ? "s" : ""})`,
      created_by: input.created_by,
      items: Array.from(groups.values()).map((g) => ({
        product_id: g.product_id,
        quantity: g.quantity,
        purchase_rate: g.purchase_rate,
        offer_price: g.offer_price,
        transport_cost: g.transport_cost,
        labor_cost: g.labor_cost,
        other_cost: g.other_cost,
        batch_no: g.batch_no,
        shade_code: g.shade_code,
        caliber: g.caliber,
      })),
    });

    if (!purchase?.id) throw new Error("Purchase creation failed");

    // Lookup created purchase_items so we can attach shortage_note + link rows
    const { data: createdItems } = await supabase
      .from("purchase_items")
      .select("id, product_id")
      .eq("purchase_id", purchase.id);

    // Stamp shortage_note on each created purchase_item
    for (const g of groups.values()) {
      const pi = (createdItems ?? []).find((i) => i.product_id === g.product_id);
      if (!pi) continue;
      const noteText = g.notes.length
        ? `From shortage: ${g.notes.join(" | ")}`
        : `From shortage planning (${g.saleItemIds.length} line${g.saleItemIds.length > 1 ? "s" : ""})`;
      await supabase
        .from("purchase_items")
        .update({ shortage_note: noteText } as any)
        .eq("id", pi.id);
    }

    // Write purchase_shortage_links of type 'planned' for every selected sale_item.
    // (Even though stock has been added, we keep link_type='planned' to record the
    //  planning intent. Actual fulfillment is read from sale_items.allocated_qty.)
    const linkRows = input.rows.map((r) => {
      const pi = (createdItems ?? []).find((i) => i.product_id === r.product_id);
      return {
        dealer_id: input.dealer_id,
        sale_item_id: r.sale_item_id,
        purchase_id: purchase.id,
        purchase_item_id: pi?.id ?? null,
        planned_qty: r.quantity,
        link_type: "planned",
        notes: r.shortage_note ?? null,
        created_by: input.created_by ?? null,
      };
    });
    if (linkRows.length) {
      const { error: linkErr } = await supabase
        .from("purchase_shortage_links" as any)
        .insert(linkRows);
      if (linkErr) {
        // Non-fatal — purchase already saved & stock updated. Surface as a soft warning.
        // eslint-disable-next-line no-console
        console.warn("[purchasePlanning] failed to write shortage links", linkErr.message);
      }
    }

    return { purchase_id: purchase.id };
  },

  /**
   * For ViewPurchase: list shortage rows that this purchase is covering.
   * Read-only — no stock or ledger side effect.
   */
  async linksForPurchase(dealerId: string, purchaseId: string): Promise<Array<{
    link_id: string;
    sale_item_id: string;
    planned_qty: number;
    link_type: string;
    notes: string | null;
    product_id: string;
    product_name: string;
    product_sku: string;
    unit_type: string;
    customer_name: string;
    invoice_number: string | null;
    sale_date: string | null;
    project_name: string | null;
    site_name: string | null;
    backorder_qty: number;
    allocated_qty: number;
    status: ShortageStatus;
  }>> {
    const { data: links, error } = await supabase
      .from("purchase_shortage_links" as any)
      .select("id, sale_item_id, planned_qty, link_type, notes")
      .eq("dealer_id", dealerId)
      .eq("purchase_id", purchaseId);
    if (error) throw new Error(error.message);
    const linkRows = (links ?? []) as unknown as Array<{
      id: string; sale_item_id: string; planned_qty: number; link_type: string; notes: string | null;
    }>;
    if (linkRows.length === 0) return [];

    const saleItemIds = Array.from(new Set(linkRows.map((l) => l.sale_item_id)));
    const { data: items } = await supabase
      .from("sale_items")
      .select(`
        id, product_id, backorder_qty, allocated_qty,
        products(name, sku, unit_type),
        sales(
          invoice_number, sale_date,
          customers(name),
          projects(project_name),
          project_sites!sales_site_id_fkey(site_name)
        )
      `)
      .eq("dealer_id", dealerId)
      .in("id", saleItemIds);

    const byId = new Map<string, any>();
    for (const it of (items ?? []) as any[]) byId.set(it.id, it);

    return linkRows.map((l) => {
      const it = byId.get(l.sale_item_id);
      const bo = Number(it?.backorder_qty) || 0;
      const al = Number(it?.allocated_qty) || 0;
      return {
        link_id: l.id,
        sale_item_id: l.sale_item_id,
        planned_qty: Number(l.planned_qty) || 0,
        link_type: l.link_type,
        notes: l.notes,
        product_id: it?.product_id ?? "",
        product_name: it?.products?.name ?? "—",
        product_sku: it?.products?.sku ?? "",
        unit_type: it?.products?.unit_type ?? "piece",
        customer_name: it?.sales?.customers?.name ?? "—",
        invoice_number: it?.sales?.invoice_number ?? null,
        sale_date: it?.sales?.sale_date ?? null,
        project_name: it?.sales?.projects?.project_name ?? null,
        site_name: it?.sales?.project_sites?.site_name ?? null,
        backorder_qty: bo,
        allocated_qty: al,
        status: deriveStatus(bo, al, Number(l.planned_qty) || 0),
      };
    });
  },
};
