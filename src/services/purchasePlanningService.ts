/**
 * Purchase Planning Service — VPS-backed reads + link writes (Phase 3U-15).
 *
 * Draft creation orchestrates the existing VPS POST /api/purchases call,
 * then writes shortage links via /api/purchase-planning/links.
 * Public surface preserved.
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { purchaseService } from "@/services/purchaseService";

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
  open_qty: number;
  planned_qty: number;
  fulfilled_qty: number;
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

export interface ProjectShortageRow {
  key: string;
  project_id: string | null;
  project_name: string;
  site_id: string | null;
  site_name: string | null;
  customer_id: string | null;
  customer_name: string;
  shortage_qty: number;
  pending_lines: number;
  pending_products: number;
  oldest_demand_date: string | null;
  open_qty: number;
  planned_qty: number;
}

export interface PlanningStats {
  totalProductsShort: number;
  totalShortageUnits: number;
  totalCustomersWaiting: number;
  oldestDemandDate: string | null;
  topProducts: ProductShortageRow[];
  topProjects: ProjectShortageRow[];
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
  rows: Array<{
    sale_item_id: string;
    product_id: string;
    quantity: number;
    purchase_rate: number;
    transport_cost?: number;
    labor_cost?: number;
    other_cost?: number;
    offer_price?: number;
    batch_no?: string;
    shade_code?: string;
    caliber?: string;
    shortage_note?: string;
  }>;
}

async function vpsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  if (res.status === 204) return undefined as unknown as T;
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

function splitContextKey(productId: string, shade: string | null, caliber: string | null): string {
  const s = (shade ?? "").trim();
  const c = (caliber ?? "").trim();
  if (!s && !c) return productId;
  return `${productId}|${s}|${c}`;
}

export const purchasePlanningService = {
  async productShortages(dealerId: string): Promise<ProductShortageRow[]> {
    const body = await vpsJson<{ rows: ProductShortageRow[] }>(
      `/api/purchase-planning/product-shortages?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return body.rows ?? [];
  },

  async customerShortages(dealerId: string, productId?: string): Promise<CustomerShortageRow[]> {
    const qs = new URLSearchParams({ dealerId });
    if (productId) qs.set("productId", productId);
    const body = await vpsJson<{ rows: CustomerShortageRow[] }>(
      `/api/purchase-planning/customer-shortages?${qs}`,
    );
    return body.rows ?? [];
  },

  async projectSiteShortages(dealerId: string): Promise<ProjectShortageRow[]> {
    const body = await vpsJson<{ rows: ProjectShortageRow[] }>(
      `/api/purchase-planning/project-site-shortages?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return body.rows ?? [];
  },

  async dashboardStats(dealerId: string): Promise<PlanningStats> {
    const stats = await vpsJson<PlanningStats>(
      `/api/purchase-planning/dashboard-stats?dealerId=${encodeURIComponent(dealerId)}`,
    );
    // topProjects intentionally not computed in dashboard endpoint; fetch if needed.
    if (!stats.topProjects || stats.topProjects.length === 0) {
      try {
        const projects = await this.projectSiteShortages(dealerId);
        stats.topProjects = projects.slice(0, 5);
      } catch {
        stats.topProjects = [];
      }
    }
    return stats;
  },

  /**
   * Create a real purchase from selected shortage rows (orchestrated client-side).
   *  1. Group rows by product + shade/caliber (tile-safe)
   *  2. Call purchaseService.create() — already on VPS, atomic
   *  3. Stamp shortage_note on each created purchase_item
   *  4. Insert purchase_shortage_links of type 'planned'
   */
  async createDraftFromShortage(input: CreateDraftInput): Promise<{ purchase_id: string }> {
    if (!input.rows.length) throw new Error("No shortage rows selected");

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

    // Lookup created purchase_items via the purchase detail endpoint
    let createdItems: Array<{ id: string; product_id: string }> = [];
    try {
      const detail = await vpsJson<{ items?: Array<{ id: string; product_id: string }>; row?: any }>(
        `/api/purchases/${purchase.id}?dealerId=${encodeURIComponent(input.dealer_id)}`,
      );
      createdItems = detail.items ?? (detail as any).row?.items ?? [];
    } catch {
      // best-effort
    }

    // Stamp shortage_note on each created purchase_item
    for (const g of groups.values()) {
      const pi = createdItems.find((i) => i.product_id === g.product_id);
      if (!pi) continue;
      const noteText = g.notes.length
        ? `From shortage: ${g.notes.join(" | ")}`
        : `From shortage planning (${g.saleItemIds.length} line${g.saleItemIds.length > 1 ? "s" : ""})`;
      try {
        await vpsJson(`/api/purchase-planning/purchase-items/${pi.id}/shortage-note`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealerId: input.dealer_id, note: noteText }),
        });
      } catch (e) {
        console.warn("[purchasePlanning] failed to stamp shortage_note", e);
      }
    }

    // Write planning links
    const linkRows = input.rows.map((r) => {
      const pi = createdItems.find((i) => i.product_id === r.product_id);
      return {
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
      try {
        await vpsJson(`/api/purchase-planning/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealerId: input.dealer_id, links: linkRows }),
        });
      } catch (e: any) {
        console.warn("[purchasePlanning] failed to write shortage links", e?.message);
      }
    }

    return { purchase_id: purchase.id };
  },

  async linksForPurchase(dealerId: string, purchaseId: string) {
    const body = await vpsJson<{ rows: any[] }>(
      `/api/purchase-planning/links/by-purchase/${encodeURIComponent(purchaseId)}?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return body.rows ?? [];
  },
};
