/**
 * VPS adapter (Phase 2 — scaffold only).
 *
 * Wires the generic ResourceAdapter contract onto the self-hosted Express
 * API at `${env.VPS_API_BASE}/api/<resource>`. The backend routes for these
 * resources DO NOT EXIST YET (Phase 3 work) — calling this adapter without
 * the matching backend endpoint will throw a clear "not implemented" error.
 *
 * Why ship it now?
 *   - Locks the contract so adapter swaps are mechanical in Phase 3.
 *   - Lets us run shadow-mode reads as soon as a single VPS endpoint exists.
 *   - Default flag is "supabase" so this code is dormant in production.
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import type { ListQuery, ListResult, ResourceAdapter, ResourceName } from "./types";

const RESOURCE_PATH: Record<ResourceName, string> = {
  CUSTOMERS: "customers",
  SUPPLIERS: "suppliers",
  PRODUCTS: "products",
  STOCK: "stock",
  BATCHES: "batches",
  SALES: "sales",
  QUOTATIONS: "quotations",
  DELIVERIES: "deliveries",
  PURCHASES: "purchases",
};

class VpsAdapterError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function parseOrThrow(res: Response, action: string): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (res.status === 404 && body?.code === "ROUTE_NOT_IMPLEMENTED") {
    throw new VpsAdapterError(
      `VPS endpoint for ${action} not implemented yet`,
      res.status,
      body,
    );
  }
  if (!res.ok) {
    throw new VpsAdapterError(body?.error || `VPS ${action} failed`, res.status, body);
  }
  return body;
}

export function createVpsAdapter<T = unknown>(
  resource: ResourceName,
): ResourceAdapter<T> {
  const base = `/api/${RESOURCE_PATH[resource]}`;

  return {
    async list(query: ListQuery): Promise<ListResult<T>> {
      const params = new URLSearchParams();
      params.set("dealerId", query.dealerId);
      if (query.page !== undefined) params.set("page", String(query.page));
      if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
      if (query.search) params.set("search", query.search);
      if (query.orderBy) {
        params.set("orderBy", query.orderBy.column);
        params.set("orderDir", query.orderBy.direction);
      }
      if (query.filters) {
        for (const [k, v] of Object.entries(query.filters)) {
          if (v !== null && v !== undefined) params.set(`f.${k}`, String(v));
        }
      }
      const res = await vpsAuthedFetch(`${base}?${params.toString()}`);
      const body = await parseOrThrow(res, `${resource} list`);
      return { rows: (body.rows ?? []) as T[], total: Number(body.total ?? 0) };
    },

    async getById(id: string, dealerId: string): Promise<T | null> {
      const res = await vpsAuthedFetch(`${base}/${id}?dealerId=${dealerId}`);
      if (res.status === 404) return null;
      const body = await parseOrThrow(res, `${resource} get`);
      return (body.row as T) ?? null;
    },

    async create(data, dealerId: string): Promise<T> {
      const res = await vpsAuthedFetch(base, {
        method: "POST",
        body: JSON.stringify({ dealerId, data }),
      });
      const body = await parseOrThrow(res, `${resource} create`);
      return body.row as T;
    },

    async update(id: string, data, dealerId: string): Promise<T> {
      const res = await vpsAuthedFetch(`${base}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ dealerId, data }),
      });
      const body = await parseOrThrow(res, `${resource} update`);
      return body.row as T;
    },

    async remove(id: string, dealerId: string): Promise<void> {
      const res = await vpsAuthedFetch(`${base}/${id}?dealerId=${dealerId}`, {
        method: "DELETE",
      });
      await parseOrThrow(res, `${resource} delete`);
    },
  };
}

export { VpsAdapterError };
