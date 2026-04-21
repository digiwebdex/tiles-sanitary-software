/**
 * Shadow adapter (Phase 2).
 *
 * Wraps the primary (Supabase) adapter and ALSO triggers a parallel read
 * against the VPS adapter — used for verifying parity before flipping a
 * resource fully to VPS in Phase 3.
 *
 *   - All write operations go to the PRIMARY only (Supabase). Shadow never
 *     writes — it is read-only verification.
 *   - Read operations return the primary result IMMEDIATELY. The VPS read
 *     is fired in parallel; mismatches are logged via createLogger but do
 *     not affect the user's UI or throw errors.
 *   - VPS read failures (including ROUTE_NOT_IMPLEMENTED) are logged and
 *     swallowed. Production is never blocked by shadow.
 */
import { createLogger } from "@/lib/logger";
import type { ListQuery, ListResult, ResourceAdapter, ResourceName } from "./types";

const log = createLogger("data:shadow");

export function createShadowAdapter<T = unknown>(
  resource: ResourceName,
  primary: ResourceAdapter<T>,
  shadow: ResourceAdapter<T>,
): ResourceAdapter<T> {
  function compareLists(a: ListResult<T>, b: ListResult<T>) {
    if (a.total !== b.total) {
      log.warn(`[${resource}] shadow total mismatch`, {
        primary: a.total,
        vps: b.total,
      });
    }
    if (a.rows.length !== b.rows.length) {
      log.warn(`[${resource}] shadow row-count mismatch`, {
        primary: a.rows.length,
        vps: b.rows.length,
      });
    }
  }

  return {
    async list(query: ListQuery): Promise<ListResult<T>> {
      const primaryResult = await primary.list(query);
      shadow
        .list(query)
        .then((shadowResult) => compareLists(primaryResult, shadowResult))
        .catch((err) =>
          log.warn(`[${resource}] shadow list failed`, { error: String(err) }),
        );
      return primaryResult;
    },

    async getById(id: string, dealerId: string): Promise<T | null> {
      const primaryResult = await primary.getById(id, dealerId);
      shadow
        .getById(id, dealerId)
        .then((shadowResult) => {
          const aMissing = primaryResult === null;
          const bMissing = shadowResult === null;
          if (aMissing !== bMissing) {
            log.warn(`[${resource}] shadow getById presence mismatch`, {
              id,
              primary: !aMissing,
              vps: !bMissing,
            });
          }
        })
        .catch((err) =>
          log.warn(`[${resource}] shadow getById failed`, { id, error: String(err) }),
        );
      return primaryResult;
    },

    create(data, dealerId) {
      return primary.create(data, dealerId);
    },
    update(id, data, dealerId) {
      return primary.update(id, data, dealerId);
    },
    remove(id, dealerId) {
      return primary.remove(id, dealerId);
    },
  };
}
