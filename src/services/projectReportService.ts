import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

// ── Types ───────────────────────────────────────────────────────────
export interface SalesByProjectRow {
  project_id: string;
  project_name: string;
  project_code: string;
  customer_name: string;
  invoice_count: number;
  total_sales: number;
  outstanding: number;
}

export interface OutstandingByProjectRow {
  project_id: string;
  project_name: string;
  project_code: string;
  customer_name: string;
  billed: number;
  paid: number;
  due: number;
}

export interface DeliveryHistoryBySiteRow {
  site_id: string;
  site_name: string;
  site_address: string | null;
  project_name: string;
  project_code: string;
  customer_name: string;
  challan_count: number;
  delivery_count: number;
  pending_deliveries: number;
  latest_delivery_date: string | null;
}

export interface ProjectQuotationPipelineRow {
  project_id: string;
  project_name: string;
  project_code: string;
  customer_name: string;
  quote_count: number;
  active_value: number;
  converted_value: number;
  expired_lost_value: number;
}

export interface TopActiveProjectRow {
  project_id: string;
  project_name: string;
  project_code: string;
  customer_name: string;
  activity_count: number; // sales + challans + deliveries
  total_value: number;    // sales total
}

export interface ProjectDashboardStats {
  activeProjectsCount: number;
  pendingDeliveriesBySite: { site_id: string; site_name: string; project_name: string; pending_count: number }[];
  totalProjectOutstanding: number;
  topActive: TopActiveProjectRow[];
}

// ── Helpers ─────────────────────────────────────────────────────────
const toNum = (v: any) => Number(v ?? 0) || 0;

interface ProjectMeta {
  id: string;
  project_name: string;
  project_code: string;
  status: string;
  customer: { id: string; name: string } | null;
}

async function loadProjectsMeta(dealerId: string): Promise<Map<string, ProjectMeta>> {
  const { data, error } = await sb
    .from("projects")
    .select("id, project_name, project_code, status, customer:customers!projects_customer_id_fkey(id, name)")
    .eq("dealer_id", dealerId);
  if (error) throw new Error(error.message);
  const map = new Map<string, ProjectMeta>();
  for (const p of (data ?? [])) {
    map.set(p.id, p as ProjectMeta);
  }
  return map;
}

// ── Reports ─────────────────────────────────────────────────────────
export const projectReportService = {
  /** Sales by Project — invoice count + revenue + outstanding per project. */
  async salesByProject(dealerId: string): Promise<SalesByProjectRow[]> {
    const projects = await loadProjectsMeta(dealerId);
    const { data, error } = await sb
      .from("sales")
      .select("project_id, total_amount, due_amount")
      .eq("dealer_id", dealerId)
      .not("project_id", "is", null);
    if (error) throw new Error(error.message);

    const agg = new Map<string, { count: number; total: number; due: number }>();
    for (const r of (data ?? [])) {
      const pid = r.project_id as string;
      const cur = agg.get(pid) ?? { count: 0, total: 0, due: 0 };
      cur.count += 1;
      cur.total += toNum(r.total_amount);
      cur.due += toNum(r.due_amount);
      agg.set(pid, cur);
    }
    const rows: SalesByProjectRow[] = [];
    for (const [pid, v] of agg.entries()) {
      const p = projects.get(pid);
      if (!p) continue;
      rows.push({
        project_id: pid,
        project_name: p.project_name,
        project_code: p.project_code,
        customer_name: p.customer?.name ?? "—",
        invoice_count: v.count,
        total_sales: v.total,
        outstanding: v.due,
      });
    }
    return rows.sort((a, b) => b.total_sales - a.total_sales);
  },

  /** Outstanding by Project — billed / paid / due per project. */
  async outstandingByProject(dealerId: string): Promise<OutstandingByProjectRow[]> {
    const projects = await loadProjectsMeta(dealerId);
    const { data, error } = await sb
      .from("sales")
      .select("project_id, total_amount, paid_amount, due_amount")
      .eq("dealer_id", dealerId)
      .not("project_id", "is", null);
    if (error) throw new Error(error.message);

    const agg = new Map<string, { billed: number; paid: number; due: number }>();
    for (const r of (data ?? [])) {
      const pid = r.project_id as string;
      const cur = agg.get(pid) ?? { billed: 0, paid: 0, due: 0 };
      cur.billed += toNum(r.total_amount);
      cur.paid += toNum(r.paid_amount);
      cur.due += toNum(r.due_amount);
      agg.set(pid, cur);
    }
    const rows: OutstandingByProjectRow[] = [];
    for (const [pid, v] of agg.entries()) {
      const p = projects.get(pid);
      if (!p) continue;
      rows.push({
        project_id: pid,
        project_name: p.project_name,
        project_code: p.project_code,
        customer_name: p.customer?.name ?? "—",
        billed: v.billed,
        paid: v.paid,
        due: v.due,
      });
    }
    return rows.sort((a, b) => b.due - a.due);
  },

  /** Delivery History by Site — challan/delivery counts + latest delivery + pending. */
  async deliveryHistoryBySite(dealerId: string): Promise<DeliveryHistoryBySiteRow[]> {
    const { data: sites, error: sErr } = await sb
      .from("project_sites")
      .select("id, site_name, address, project_id, customer_id, projects:projects(project_name, project_code), customers:customers!project_sites_customer_id_fkey(name)")
      .eq("dealer_id", dealerId);
    if (sErr) throw new Error(sErr.message);

    const [challansRes, deliveriesRes] = await Promise.all([
      sb.from("challans").select("site_id, status").eq("dealer_id", dealerId).not("site_id", "is", null),
      sb.from("deliveries").select("site_id, status, delivery_date").eq("dealer_id", dealerId).not("site_id", "is", null),
    ]);
    if (challansRes.error) throw new Error(challansRes.error.message);
    if (deliveriesRes.error) throw new Error(deliveriesRes.error.message);

    const challanMap = new Map<string, number>();
    for (const c of (challansRes.data ?? [])) {
      challanMap.set(c.site_id, (challanMap.get(c.site_id) ?? 0) + 1);
    }
    const dStat = new Map<string, { total: number; pending: number; latest: string | null }>();
    for (const d of (deliveriesRes.data ?? [])) {
      const cur = dStat.get(d.site_id) ?? { total: 0, pending: 0, latest: null };
      cur.total += 1;
      if (d.status !== "delivered") cur.pending += 1;
      if (!cur.latest || (d.delivery_date && d.delivery_date > cur.latest)) cur.latest = d.delivery_date;
      dStat.set(d.site_id, cur);
    }

    return (sites ?? []).map((s: any) => {
      const ds = dStat.get(s.id);
      return {
        site_id: s.id,
        site_name: s.site_name,
        site_address: s.address ?? null,
        project_name: s.projects?.project_name ?? "—",
        project_code: s.projects?.project_code ?? "—",
        customer_name: s.customers?.name ?? "—",
        challan_count: challanMap.get(s.id) ?? 0,
        delivery_count: ds?.total ?? 0,
        pending_deliveries: ds?.pending ?? 0,
        latest_delivery_date: ds?.latest ?? null,
      };
    }).sort((a, b) => (b.latest_delivery_date ?? "").localeCompare(a.latest_delivery_date ?? ""));
  },

  /** Project Quotation Pipeline — counts and value buckets per project. */
  async quotationPipeline(dealerId: string): Promise<ProjectQuotationPipelineRow[]> {
    const projects = await loadProjectsMeta(dealerId);
    const { data, error } = await sb
      .from("quotations")
      .select("project_id, status, total_amount")
      .eq("dealer_id", dealerId)
      .not("project_id", "is", null);
    if (error) throw new Error(error.message);

    const agg = new Map<string, { count: number; active: number; converted: number; lost: number }>();
    for (const r of (data ?? [])) {
      const pid = r.project_id as string;
      const cur = agg.get(pid) ?? { count: 0, active: 0, converted: 0, lost: 0 };
      cur.count += 1;
      const amt = toNum(r.total_amount);
      if (r.status === "active" || r.status === "draft") cur.active += amt;
      else if (r.status === "converted") cur.converted += amt;
      else if (r.status === "expired" || r.status === "cancelled" || r.status === "revised") cur.lost += amt;
      agg.set(pid, cur);
    }
    const rows: ProjectQuotationPipelineRow[] = [];
    for (const [pid, v] of agg.entries()) {
      const p = projects.get(pid);
      if (!p) continue;
      rows.push({
        project_id: pid,
        project_name: p.project_name,
        project_code: p.project_code,
        customer_name: p.customer?.name ?? "—",
        quote_count: v.count,
        active_value: v.active,
        converted_value: v.converted,
        expired_lost_value: v.lost,
      });
    }
    return rows.sort((a, b) => b.active_value - a.active_value);
  },

  /** Top Active Projects — combined activity (sales/challans/deliveries) + sales value. */
  async topActiveProjects(dealerId: string, limit = 10): Promise<TopActiveProjectRow[]> {
    const projects = await loadProjectsMeta(dealerId);

    const [salesRes, challanRes, delivRes] = await Promise.all([
      sb.from("sales").select("project_id, total_amount").eq("dealer_id", dealerId).not("project_id", "is", null),
      sb.from("challans").select("project_id").eq("dealer_id", dealerId).not("project_id", "is", null),
      sb.from("deliveries").select("project_id").eq("dealer_id", dealerId).not("project_id", "is", null),
    ]);
    if (salesRes.error) throw new Error(salesRes.error.message);
    if (challanRes.error) throw new Error(challanRes.error.message);
    if (delivRes.error) throw new Error(delivRes.error.message);

    const stat = new Map<string, { activity: number; value: number }>();
    for (const r of (salesRes.data ?? [])) {
      const cur = stat.get(r.project_id) ?? { activity: 0, value: 0 };
      cur.activity += 1; cur.value += toNum(r.total_amount);
      stat.set(r.project_id, cur);
    }
    for (const r of (challanRes.data ?? [])) {
      const cur = stat.get(r.project_id) ?? { activity: 0, value: 0 };
      cur.activity += 1;
      stat.set(r.project_id, cur);
    }
    for (const r of (delivRes.data ?? [])) {
      const cur = stat.get(r.project_id) ?? { activity: 0, value: 0 };
      cur.activity += 1;
      stat.set(r.project_id, cur);
    }

    const rows: TopActiveProjectRow[] = [];
    for (const [pid, v] of stat.entries()) {
      const p = projects.get(pid);
      if (!p) continue;
      rows.push({
        project_id: pid,
        project_name: p.project_name,
        project_code: p.project_code,
        customer_name: p.customer?.name ?? "—",
        activity_count: v.activity,
        total_value: v.value,
      });
    }
    return rows
      .sort((a, b) => b.total_value - a.total_value || b.activity_count - a.activity_count)
      .slice(0, limit);
  },

  /** Site delivery history (single site) — sales + challans + deliveries. */
  async siteHistory(dealerId: string, siteId: string) {
    const [salesRes, challanRes, delivRes] = await Promise.all([
      sb.from("sales")
        .select("id, invoice_number, sale_date, total_amount, paid_amount, due_amount, sale_status")
        .eq("dealer_id", dealerId).eq("site_id", siteId)
        .order("sale_date", { ascending: false }),
      sb.from("challans")
        .select("id, challan_no, challan_date, status, delivery_status, sale_id")
        .eq("dealer_id", dealerId).eq("site_id", siteId)
        .order("challan_date", { ascending: false }),
      sb.from("deliveries")
        .select("id, delivery_no, delivery_date, status")
        .eq("dealer_id", dealerId).eq("site_id", siteId)
        .order("delivery_date", { ascending: false }),
    ]);
    if (salesRes.error) throw new Error(salesRes.error.message);
    if (challanRes.error) throw new Error(challanRes.error.message);
    if (delivRes.error) throw new Error(delivRes.error.message);

    const sales = salesRes.data ?? [];
    const totalSales = sales.reduce((s: number, r: any) => s + toNum(r.total_amount), 0);
    const totalDue = sales.reduce((s: number, r: any) => s + toNum(r.due_amount), 0);
    const deliveries = delivRes.data ?? [];
    const pendingDeliveries = deliveries.filter((d: any) => d.status !== "delivered").length;

    return {
      sales,
      challans: challanRes.data ?? [],
      deliveries,
      summary: {
        sales_count: sales.length,
        total_sales: totalSales,
        outstanding: totalDue,
        challan_count: (challanRes.data ?? []).length,
        delivery_count: deliveries.length,
        pending_deliveries: pendingDeliveries,
      },
    };
  },

  /** Owner dashboard quick stats. */
  async dashboardStats(dealerId: string): Promise<ProjectDashboardStats> {
    const [activeRes, sitesRes, salesRes, top] = await Promise.all([
      sb.from("projects").select("id", { count: "exact", head: true }).eq("dealer_id", dealerId).eq("status", "active"),
      sb.from("project_sites")
        .select("id, site_name, projects:projects(project_name)")
        .eq("dealer_id", dealerId).eq("status", "active"),
      sb.from("sales").select("due_amount").eq("dealer_id", dealerId).not("project_id", "is", null),
      this.topActiveProjects(dealerId, 5),
    ]);

    if (sitesRes.error) throw new Error(sitesRes.error.message);
    if (salesRes.error) throw new Error(salesRes.error.message);

    const siteIds = (sitesRes.data ?? []).map((s: any) => s.id);
    let pendingMap = new Map<string, number>();
    if (siteIds.length > 0) {
      const { data: pendings, error } = await sb
        .from("deliveries")
        .select("site_id")
        .eq("dealer_id", dealerId)
        .in("site_id", siteIds)
        .neq("status", "delivered");
      if (error) throw new Error(error.message);
      for (const d of (pendings ?? [])) {
        pendingMap.set(d.site_id, (pendingMap.get(d.site_id) ?? 0) + 1);
      }
    }
    const pendingDeliveriesBySite = (sitesRes.data ?? [])
      .map((s: any) => ({
        site_id: s.id,
        site_name: s.site_name,
        project_name: s.projects?.project_name ?? "—",
        pending_count: pendingMap.get(s.id) ?? 0,
      }))
      .filter((s) => s.pending_count > 0)
      .sort((a, b) => b.pending_count - a.pending_count)
      .slice(0, 5);

    const totalProjectOutstanding = (salesRes.data ?? []).reduce(
      (s: number, r: any) => s + toNum(r.due_amount),
      0,
    );

    return {
      activeProjectsCount: activeRes.count ?? 0,
      pendingDeliveriesBySite,
      totalProjectOutstanding,
      topActive: top,
    };
  },
};
