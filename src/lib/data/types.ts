/**
 * Shared type contracts for the dataClient adapter layer (Phase 2).
 *
 * The goal is a STABLE interface that both supabaseAdapter and vpsAdapter
 * implement, so that Phase 3 module migrations only touch one adapter at a
 * time without changing call sites.
 *
 * IMPORTANT: this layer does NOT replace existing services yet. No
 * service/page should switch to the dataClient in Phase 2 — we only build
 * the foundation + a default supabase passthrough so it's a no-op in prod.
 */

import type { DataResource } from "@/lib/env";

export type ResourceName = DataResource;

/** Generic list query. Adapters translate to their backend-specific format. */
export interface ListQuery {
  /** dealer scope is ALWAYS required at the call site for tenant safety */
  dealerId: string;
  /** zero-indexed page (0 = first page) */
  page?: number;
  pageSize?: number;
  /** simple equality filters: { status: "active" } */
  filters?: Record<string, string | number | boolean | null>;
  /** free-text search applied to backend-defined fields */
  search?: string;
  /** ISO column name → "asc" | "desc" */
  orderBy?: { column: string; direction: "asc" | "desc" };
}

export interface ListResult<T> {
  rows: T[];
  total: number;
}

/** Adapter contract — every backend implements this surface. */
export interface ResourceAdapter<T = unknown, Insert = Partial<T>, Update = Partial<T>> {
  list(query: ListQuery): Promise<ListResult<T>>;
  getById(id: string, dealerId: string): Promise<T | null>;
  create(data: Insert, dealerId: string): Promise<T>;
  update(id: string, data: Update, dealerId: string): Promise<T>;
  remove(id: string, dealerId: string): Promise<void>;
}

/** A factory wires the adapter for a given resource. */
export type AdapterFactory = <T = unknown>(resource: ResourceName) => ResourceAdapter<T>;
