import { supabase } from "@/integrations/supabase/client";

/**
 * Purchase Planning from Shortage — Batch 1 (read-only / derived layer)
 *
 * Shortage = customer-committed demand on sale_items minus stock already
 * allocated from received purchases (backorder_allocations).
 *
 * Net shortage qty per sale_item = backorder_qty - allocated_qty
 *
 * This service AGGREGATES that demand by:
 *   • product (purchase need roll-up)
 *   • customer (who is waiting)
 *   • project / site (where it must be delivered)
 *
 * NO writes. NO stock side effect. NO ledger side effect.
 * Purely advisory until Batch 2 introduces purchase drafts.
 */

export interface ProductShortageRow {
  product_id: string;
  name: string;
  sku: string;
  brand: string;
  unit_type: string;
  shortage_qty: number;          // sum of unfulfilled (backorder_qty - allocated_qty)
  pending_lines: number;          // # of sale_items contributing
  pending_customers: number;      // distinct customers waiting
  oldest_demand_date: string | null;
  suggested_purchase_qty: number; // = shortage_qty for Batch 1 (1:1)
}

export interface CustomerShortageRow {
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
}

export interface PlanningStats {
  totalProductsShort: number;
  totalShortageUnits: number;
  totalCustomersWaiting: number;
  oldestDemandDate: string | null;
  topProducts: ProductShortageRow[];
}

interface RawRow {
  id: string;
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
    customers: { name: string | null } | null;
    projects: { project_name: string | null } | null;
    project_sites: { site_name: string | null } | null;
  } | null;
}

async function fetchOpenShortageRows(dealerId: string): Promise<RawRow[]> {
  const { data, error } = await supabase
    .from("sale_items")
    .select(`
      id, product_id, sale_id, backorder_qty, allocated_qty,
      products(name, sku, brand, unit_type),
      sales(
        id, invoice_number, sale_date, customer_id, project_id, site_id, created_at,
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

function unfulfilled(row: RawRow): number {
  const bo = Number(row.backorder_qty) || 0;
  const al = Number(row.allocated_qty) || 0;
  return Math.max(0, bo - al);
}

export const purchasePlanningService = {
  /**
   * Roll-up shortage by product.
   * suggested_purchase_qty = shortage_qty (Batch 1: 1:1, owner can override later).
   */
  async productShortages(dealerId: string): Promise<ProductShortageRow[]> {
    const rows = await fetchOpenShortageRows(dealerId);
    const map = new Map<string, ProductShortageRow & { customerSet: Set<string> }>();

    for (const r of rows) {
      const need = unfulfilled(r);
      if (need <= 0) continue;
      const pid = r.product_id;
      const date = r.sales?.sale_date ?? r.sales?.created_at ?? null;
      const cust = r.sales?.customer_id ?? "anon";
      const cur = map.get(pid);
      if (cur) {
        cur.shortage_qty += need;
        cur.pending_lines += 1;
        cur.customerSet.add(cust);
        if (date && (!cur.oldest_demand_date || date < cur.oldest_demand_date)) {
          cur.oldest_demand_date = date;
        }
        cur.suggested_purchase_qty = cur.shortage_qty;
      } else {
        const customerSet = new Set<string>([cust]);
        map.set(pid, {
          product_id: pid,
          name: r.products?.name ?? "Unknown",
          sku: r.products?.sku ?? "",
          brand: r.products?.brand ?? "—",
          unit_type: r.products?.unit_type ?? "piece",
          shortage_qty: need,
          pending_lines: 1,
          pending_customers: 0,
          oldest_demand_date: date,
          suggested_purchase_qty: need,
          customerSet,
        });
      }
    }

    return Array.from(map.values())
      .map(({ customerSet, ...rest }) => ({ ...rest, pending_customers: customerSet.size }))
      .sort((a, b) => b.shortage_qty - a.shortage_qty);
  },

  /**
   * Customer-level breakdown: who is waiting on what, where to deliver.
   * Optional productId filter for drill-down from product roll-up.
   */
  async customerShortages(dealerId: string, productId?: string): Promise<CustomerShortageRow[]> {
    const rows = await fetchOpenShortageRows(dealerId);
    const out: CustomerShortageRow[] = [];

    for (const r of rows) {
      const need = unfulfilled(r);
      if (need <= 0) continue;
      if (productId && r.product_id !== productId) continue;

      out.push({
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
      });
    }

    // Oldest demand first (FIFO operational priority)
    return out.sort((a, b) => (a.sale_date < b.sale_date ? -1 : 1));
  },

  /**
   * Dashboard stats: high-level KPIs + top 5 short products.
   */
  async dashboardStats(dealerId: string): Promise<PlanningStats> {
    const products = await this.productShortages(dealerId);
    const totalShortageUnits = products.reduce((s, p) => s + p.shortage_qty, 0);
    const totalCustomersWaiting = new Set(
      (await this.customerShortages(dealerId)).map((r) => r.customer_id).filter(Boolean),
    ).size;
    let oldest: string | null = null;
    for (const p of products) {
      if (p.oldest_demand_date && (!oldest || p.oldest_demand_date < oldest)) {
        oldest = p.oldest_demand_date;
      }
    }

    return {
      totalProductsShort: products.length,
      totalShortageUnits,
      totalCustomersWaiting,
      oldestDemandDate: oldest,
      topProducts: products.slice(0, 5),
    };
  },
};
