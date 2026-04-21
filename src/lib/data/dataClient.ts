/**
 * dataClient — Phase 2 entry point.
 *
 * Resolves the right adapter per resource based on env flags:
 *   - "supabase" (default) → supabaseAdapter (no behavior change)
 *   - "vps"                → vpsAdapter (requires Phase 3 backend route)
 *   - "shadow"             → supabase primary + parallel vps read for diffing
 *
 * Usage (Phase 3):
 *   import { dataClient } from "@/lib/data/dataClient";
 *   const customers = dataClient<Customer>("CUSTOMERS");
 *   await customers.list({ dealerId, page: 0, pageSize: 25 });
 *
 * Phase 2 GUARANTEE: nothing in the project actually calls this yet, and
 * with all flags defaulted to "supabase" the only behavior change is dead
 * code being shipped in the bundle. Rollback = unset all VITE_DATA_* envs.
 */
import { env, type DataResource } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { createShadowAdapter } from "./shadowAdapter";
import { createSupabaseAdapter } from "./supabaseAdapter";
import { createVpsAdapter } from "./vpsAdapter";
import type { ResourceAdapter } from "./types";

const log = createLogger("data:client");

const cache = new Map<string, ResourceAdapter<unknown>>();

export function dataClient<T = unknown>(resource: DataResource): ResourceAdapter<T> {
  const backend = env.DATA_BACKENDS[resource];
  const cacheKey = `${resource}:${backend}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached as ResourceAdapter<T>;

  let adapter: ResourceAdapter<T>;
  switch (backend) {
    case "vps":
      log.debug(`[${resource}] using VPS adapter`);
      adapter = createVpsAdapter<T>(resource);
      break;
    case "shadow":
      log.debug(`[${resource}] using SHADOW adapter (supabase primary + vps verify)`);
      adapter = createShadowAdapter<T>(
        resource,
        createSupabaseAdapter<T>(resource),
        createVpsAdapter<T>(resource),
      );
      break;
    case "supabase":
    default:
      adapter = createSupabaseAdapter<T>(resource);
      break;
  }

  cache.set(cacheKey, adapter as ResourceAdapter<unknown>);
  return adapter;
}

/** Diagnostic helper — used by dev-tools / health pages, not by features. */
export function getDataBackends() {
  return { ...env.DATA_BACKENDS };
}
