import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

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

async function vpsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

export const projectService = {
  async getNextProjectCode(dealerId: string): Promise<string> {
    const params = new URLSearchParams({ dealerId });
    const body = await vpsRequest<{ code: string }>(
      `/api/projects/next-code?${params.toString()}`,
    );
    return body.code;
  },

  async list(
    dealerId: string,
    opts: { search?: string; status?: ProjectStatus | ""; customerId?: string } = {},
  ): Promise<ProjectWithStats[]> {
    const params = new URLSearchParams({ dealerId });
    if (opts.search?.trim()) params.set("search", opts.search.trim());
    if (opts.status) params.set("status", opts.status);
    if (opts.customerId) params.set("customerId", opts.customerId);
    return await vpsRequest<ProjectWithStats[]>(`/api/projects?${params.toString()}`);
  },

  async getById(id: string): Promise<Project> {
    // dealerId is resolved from the JWT on the server.
    return await vpsRequest<Project>(`/api/projects/${id}`);
  },

  async listForPicker(
    dealerId: string,
    customerId?: string | null,
  ): Promise<Pick<Project, "id" | "project_name" | "project_code" | "customer_id" | "status">[]> {
    const params = new URLSearchParams({ dealerId });
    if (customerId) params.set("customerId", customerId);
    return await vpsRequest(`/api/projects/picker?${params.toString()}`);
  },

  async create(
    dealerId: string,
    _userId: string | null,
    input: ProjectInput,
  ): Promise<Project> {
    return await vpsRequest<Project>(`/api/projects`, {
      method: "POST",
      body: JSON.stringify({ dealer_id: dealerId, ...input }),
    });
  },

  async update(id: string, dealerId: string, input: Partial<ProjectInput>): Promise<Project> {
    return await vpsRequest<Project>(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify({ dealer_id: dealerId, ...input }),
    });
  },

  async remove(id: string, dealerId: string): Promise<void> {
    const params = new URLSearchParams({ dealerId });
    await vpsRequest<{ ok: boolean }>(`/api/projects/${id}?${params.toString()}`, {
      method: "DELETE",
    });
  },

  // ── Sites ───────────────────────────────────────────────────────
  async listSites(dealerId: string, projectId: string): Promise<ProjectSite[]> {
    const params = new URLSearchParams({ dealerId });
    return await vpsRequest<ProjectSite[]>(
      `/api/projects/${projectId}/sites?${params.toString()}`,
    );
  },

  async listSitesForPicker(
    dealerId: string,
    projectId: string,
  ): Promise<Pick<ProjectSite, "id" | "site_name" | "address" | "status">[]> {
    const params = new URLSearchParams({ dealerId });
    return await vpsRequest(
      `/api/projects/${projectId}/sites/picker?${params.toString()}`,
    );
  },

  async createSite(
    dealerId: string,
    _userId: string | null,
    input: SiteInput,
  ): Promise<ProjectSite> {
    return await vpsRequest<ProjectSite>(
      `/api/projects/${input.project_id}/sites`,
      {
        method: "POST",
        body: JSON.stringify({ dealer_id: dealerId, ...input }),
      },
    );
  },

  async updateSite(
    id: string,
    dealerId: string,
    input: Partial<SiteInput>,
  ): Promise<ProjectSite> {
    return await vpsRequest<ProjectSite>(`/api/projects/sites/${id}`, {
      method: "PUT",
      body: JSON.stringify({ dealer_id: dealerId, ...input }),
    });
  },

  async removeSite(id: string, dealerId: string): Promise<void> {
    const params = new URLSearchParams({ dealerId });
    await vpsRequest<{ ok: boolean }>(`/api/projects/sites/${id}?${params.toString()}`, {
      method: "DELETE",
    });
  },

  async getProjectAndSite(
    dealerId: string,
    projectId: string | null,
    siteId: string | null,
  ): Promise<{
    project: Pick<Project, "id" | "project_name" | "project_code"> | null;
    site: Pick<ProjectSite, "id" | "site_name" | "address" | "contact_person" | "contact_phone"> | null;
  }> {
    const params = new URLSearchParams({ dealerId });
    if (projectId) params.set("projectId", projectId);
    if (siteId) params.set("siteId", siteId);
    return await vpsRequest(`/api/projects/lookup?${params.toString()}`);
  },
};
