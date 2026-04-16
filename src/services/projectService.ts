import { supabase } from "@/integrations/supabase/client";

export type ProjectStatus = "active" | "on_hold" | "completed" | "cancelled";
export type SiteStatus = "active" | "inactive";

export interface Project {
  id: string;
  dealer_id: string;
  customer_id: string;
  project_name: string;
  project_code: string;
  status: ProjectStatus;
  notes: string | null;
  start_date: string | null;
  expected_end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectSite {
  id: string;
  dealer_id: string;
  project_id: string;
  customer_id: string;
  site_name: string;
  address: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: SiteStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithStats extends Project {
  customer?: { id: string; name: string; phone: string | null } | null;
  site_count?: number;
}

export interface ProjectInput {
  customer_id: string;
  project_name: string;
  project_code?: string | null;
  status?: ProjectStatus;
  notes?: string | null;
  start_date?: string | null;
  expected_end_date?: string | null;
}

export interface SiteInput {
  project_id: string;
  customer_id: string;
  site_name: string;
  address?: string | null;
  contact_person?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  status?: SiteStatus;
}

const sb = supabase as any;

export const projectService = {
  /** Fetch next auto-generated project code (PRJ-NNNN). */
  async getNextProjectCode(dealerId: string): Promise<string> {
    const { data, error } = await sb.rpc("get_next_project_code", { p_dealer_id: dealerId });
    if (error) throw new Error(error.message);
    return String(data);
  },

  /** List all projects for the dealer (joined with customer name). */
  async list(
    dealerId: string,
    opts: { search?: string; status?: ProjectStatus | ""; customerId?: string } = {},
  ): Promise<ProjectWithStats[]> {
    const { search = "", status = "", customerId } = opts;
    let query = sb
      .from("projects")
      .select("*, customer:customers!projects_customer_id_fkey(id, name, phone)")
      .eq("dealer_id", dealerId)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (customerId) query = query.eq("customer_id", customerId);
    if (search.trim()) {
      const s = search.trim();
      query = query.or(`project_name.ilike.%${s}%,project_code.ilike.%${s}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as ProjectWithStats[];
  },

  async getById(id: string): Promise<Project> {
    const { data, error } = await sb.from("projects").select("*").eq("id", id).single();
    if (error) throw new Error(error.message);
    return data as Project;
  },

  /** Lightweight list for pickers — only id, name, code, customer_id, status. */
  async listForPicker(
    dealerId: string,
    customerId?: string | null,
  ): Promise<Pick<Project, "id" | "project_name" | "project_code" | "customer_id" | "status">[]> {
    let query = sb
      .from("projects")
      .select("id, project_name, project_code, customer_id, status")
      .eq("dealer_id", dealerId)
      .eq("status", "active")
      .order("project_name", { ascending: true });
    if (customerId) query = query.eq("customer_id", customerId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Pick<Project, "id" | "project_name" | "project_code" | "customer_id" | "status">[];
  },

  async create(
    dealerId: string,
    userId: string | null,
    input: ProjectInput,
  ): Promise<Project> {
    const code = (input.project_code ?? "").trim() || (await this.getNextProjectCode(dealerId));
    const { data, error } = await sb
      .from("projects")
      .insert({
        dealer_id: dealerId,
        customer_id: input.customer_id,
        project_name: input.project_name.trim(),
        project_code: code,
        status: input.status ?? "active",
        notes: input.notes?.trim() || null,
        start_date: input.start_date || null,
        expected_end_date: input.expected_end_date || null,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Project;
  },

  async update(id: string, dealerId: string, input: Partial<ProjectInput>): Promise<Project> {
    const patch: Record<string, unknown> = {};
    if (input.project_name !== undefined) patch.project_name = input.project_name.trim();
    if (input.project_code !== undefined) patch.project_code = (input.project_code ?? "").trim();
    if (input.customer_id !== undefined) patch.customer_id = input.customer_id;
    if (input.status !== undefined) patch.status = input.status;
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
    if (input.start_date !== undefined) patch.start_date = input.start_date || null;
    if (input.expected_end_date !== undefined) patch.expected_end_date = input.expected_end_date || null;

    const { data, error } = await sb
      .from("projects")
      .update(patch)
      .eq("id", id)
      .eq("dealer_id", dealerId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Project;
  },

  async remove(id: string, dealerId: string): Promise<void> {
    const { error } = await sb.from("projects").delete().eq("id", id).eq("dealer_id", dealerId);
    if (error) throw new Error(error.message);
  },

  // ── Sites ───────────────────────────────────────────────────────
  async listSites(dealerId: string, projectId: string): Promise<ProjectSite[]> {
    const { data, error } = await sb
      .from("project_sites")
      .select("*")
      .eq("dealer_id", dealerId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ProjectSite[];
  },

  async listSitesForPicker(
    dealerId: string,
    projectId: string,
  ): Promise<Pick<ProjectSite, "id" | "site_name" | "address" | "status">[]> {
    const { data, error } = await sb
      .from("project_sites")
      .select("id, site_name, address, status")
      .eq("dealer_id", dealerId)
      .eq("project_id", projectId)
      .eq("status", "active")
      .order("site_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Pick<ProjectSite, "id" | "site_name" | "address" | "status">[];
  },

  async createSite(dealerId: string, userId: string | null, input: SiteInput): Promise<ProjectSite> {
    const { data, error } = await sb
      .from("project_sites")
      .insert({
        dealer_id: dealerId,
        project_id: input.project_id,
        customer_id: input.customer_id,
        site_name: input.site_name.trim(),
        address: input.address?.trim() || null,
        contact_person: input.contact_person?.trim() || null,
        contact_phone: input.contact_phone?.trim() || null,
        notes: input.notes?.trim() || null,
        status: input.status ?? "active",
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ProjectSite;
  },

  async updateSite(id: string, dealerId: string, input: Partial<SiteInput>): Promise<ProjectSite> {
    const patch: Record<string, unknown> = {};
    if (input.site_name !== undefined) patch.site_name = input.site_name.trim();
    if (input.address !== undefined) patch.address = input.address?.trim() || null;
    if (input.contact_person !== undefined) patch.contact_person = input.contact_person?.trim() || null;
    if (input.contact_phone !== undefined) patch.contact_phone = input.contact_phone?.trim() || null;
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
    if (input.status !== undefined) patch.status = input.status;

    const { data, error } = await sb
      .from("project_sites")
      .update(patch)
      .eq("id", id)
      .eq("dealer_id", dealerId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ProjectSite;
  },

  async removeSite(id: string, dealerId: string): Promise<void> {
    const { error } = await sb.from("project_sites").delete().eq("id", id).eq("dealer_id", dealerId);
    if (error) throw new Error(error.message);
  },

  /** Lookup a single project + site by id (used by detail/document views). */
  async getProjectAndSite(
    dealerId: string,
    projectId: string | null,
    siteId: string | null,
  ): Promise<{
    project: Pick<Project, "id" | "project_name" | "project_code"> | null;
    site: Pick<ProjectSite, "id" | "site_name" | "address" | "contact_person" | "contact_phone"> | null;
  }> {
    let project: any = null;
    let site: any = null;
    if (projectId) {
      const { data } = await sb
        .from("projects")
        .select("id, project_name, project_code")
        .eq("id", projectId)
        .eq("dealer_id", dealerId)
        .maybeSingle();
      project = data ?? null;
    }
    if (siteId) {
      const { data } = await sb
        .from("project_sites")
        .select("id, site_name, address, contact_person, contact_phone")
        .eq("id", siteId)
        .eq("dealer_id", dealerId)
        .maybeSingle();
      site = data ?? null;
    }
    return { project, site };
  },
};
