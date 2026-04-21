/**
 * Shadow adapter (Phase 2 + 3A enhancements).
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
 *
 * Phase 3A added per-row id-set diff + per-field diff on getById, plus
 * a counter to surface mismatch rate via window.__vpsShadowStats for
 * quick browser-console verification during pilot rollout.
 */
import { createLogger } from "@/lib/logger";
import type { ListQuery, ListResult, ResourceAdapter, ResourceName } from "./types";

const log = createLogger("data:shadow");

// Fields ignored when diffing rows (timestamps, transient computed fields).
const IGNORED_FIELDS = new Set(["created_at", "updated_at"]);

interface ShadowStats {
  reads: number;
  mismatches: number;
  failures: number;
  lastMismatch: null | {
    resource: string;
    op: string;
    detail: unknown;
    at: number;
  };
}

function getStats(): ShadowStats {
  if (typeof window === "undefined") {
    return { reads: 0, mismatches: 0, failures: 0, lastMismatch: null };
  }
  const w = window as unknown as { __vpsShadowStats?: ShadowStats };
  if (!w.__vpsShadowStats) {
    w.__vpsShadowStats = { reads: 0, mismatches: 0, failures: 0, lastMismatch: null };
  }
  return w.__vpsShadowStats;
}

function recordMismatch(resource: string, op: string, detail: unknown) {
  const stats = getStats();
  stats.mismatches += 1;
  stats.lastMismatch = { resource, op, detail, at: Date.now() };
}

function recordFailure() {
  getStats().failures += 1;
}

function recordRead() {
  getStats().reads += 1;
}

function rowId(row: unknown): string | null {
  if (row && typeof row === "object" && "id" in row) {
    const id = (row as { id: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function diffRow(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs: string[] = [];
  for (const k of keys) {
    if (IGNORED_FIELDS.has(k)) continue;
    const av = a[k];
    const bv = b[k];
    // Treat null and undefined as equal
    if ((av ?? null) === (bv ?? null)) continue;
    if (typeof av === "number" && typeof bv === "number" && Math.abs(av - bv) < 1e-9) continue;
    diffs.push(k);
  }
  return diffs;
}

export function createShadowAdapter<T = unknown>(
  resource: ResourceName,
  primary: ResourceAdapter<T>,
  shadow: ResourceAdapter<T>,
): ResourceAdapter<T> {
  function compareLists(a: ListResult<T>, b: ListResult<T>) {
    if (a.total !== b.total) {
      const detail = { primary: a.total, vps: b.total };
      log.warn(`[${resource}] shadow total mismatch`, detail);
      recordMismatch(resource, "list.total", detail);
    }
    if (a.rows.length !== b.rows.length) {
      const detail = { primary: a.rows.length, vps: b.rows.length };
      log.warn(`[${resource}] shadow row-count mismatch`, detail);
      recordMismatch(resource, "list.rowCount", detail);
    }

    // Compare id sets (order-insensitive). This catches "missing rows" or
    // "extra rows" even when the count is coincidentally equal.
    const aIds = new Set(a.rows.map(rowId).filter((x): x is string => !!x));
    const bIds = new Set(b.rows.map(rowId).filter((x): x is string => !!x));
    const missingInVps: string[] = [];
    const extraInVps: string[] = [];
    aIds.forEach((id) => {
      if (!bIds.has(id)) missingInVps.push(id);
    });
    bIds.forEach((id) => {
      if (!aIds.has(id)) extraInVps.push(id);
    });
    if (missingInVps.length || extraInVps.length) {
      const detail = {
        missingInVps: missingInVps.slice(0, 10),
        extraInVps: extraInVps.slice(0, 10),
        missingCount: missingInVps.length,
        extraCount: extraInVps.length,
      };
      log.warn(`[${resource}] shadow id-set mismatch`, detail);
      recordMismatch(resource, "list.idSet", detail);
    }
  }

  return {
    async list(query: ListQuery): Promise<ListResult<T>> {
      const primaryResult = await primary.list(query);
      recordRead();
      shadow
        .list(query)
        .then((shadowResult) => compareLists(primaryResult, shadowResult))
        .catch((err) => {
          recordFailure();
          log.warn(`[${resource}] shadow list failed`, { error: String(err) });
        });
      return primaryResult;
    },

    async getById(id: string, dealerId: string): Promise<T | null> {
      const primaryResult = await primary.getById(id, dealerId);
      recordRead();
      shadow
        .getById(id, dealerId)
        .then((shadowResult) => {
          const aMissing = primaryResult === null;
          const bMissing = shadowResult === null;
          if (aMissing !== bMissing) {
            const detail = { id, primary: !aMissing, vps: !bMissing };
            log.warn(`[${resource}] shadow getById presence mismatch`, detail);
            recordMismatch(resource, "getById.presence", detail);
            return;
          }
          if (
            !aMissing &&
            !bMissing &&
            typeof primaryResult === "object" &&
            typeof shadowResult === "object"
          ) {
            const diffs = diffRow(
              primaryResult as Record<string, unknown>,
              shadowResult as Record<string, unknown>,
            );
            if (diffs.length) {
              const detail = { id, fields: diffs };
              log.warn(`[${resource}] shadow getById field mismatch`, detail);
              recordMismatch(resource, "getById.fields", detail);
            }
          }
        })
        .catch((err) => {
          recordFailure();
          log.warn(`[${resource}] shadow getById failed`, { id, error: String(err) });
        });
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
