/**
 * useSubscriptionStatus — server-clock subscription gate.
 *
 * Replaces the browser-clock computation of access level. Calls
 * `/api/subscription/status` which uses the database NOW(). Result is
 * cached in module memory for a short TTL so we don't hammer the API on
 * every render.
 *
 * Status semantics:
 *   active    → full write access
 *   expiring  → still active, end_date is within 7 days, show banner
 *   grace     → expired ≤3 days ago, write still permitted (legacy)
 *   expired   → read-only
 *   suspended → blocked
 *   none      → no subscription row, treat as expired
 */
import { useEffect, useState } from "react";
import { vpsAuthedFetch, vpsTokenStore } from "@/lib/vpsAuthClient";

export type ServerSubStatus =
  | "active"
  | "expiring"
  | "grace"
  | "expired"
  | "suspended"
  | "none";

export interface SubscriptionStatus {
  status: ServerSubStatus;
  end_date: string | null;
  days_remaining: number | null;
  is_super_admin: boolean;
  dealer_id: string | null;
}

const TTL_MS = 60_000;
let cache: { at: number; data: SubscriptionStatus } | null = null;
let inFlight: Promise<SubscriptionStatus | null> | null = null;

async function fetchStatus(): Promise<SubscriptionStatus | null> {
  if (!vpsTokenStore.access) return null;
  const res = await vpsAuthedFetch("/api/subscription/status");
  if (!res.ok) return null;
  return (await res.json()) as SubscriptionStatus;
}

export async function getServerSubscriptionStatus(
  options: { force?: boolean } = {},
): Promise<SubscriptionStatus | null> {
  if (!options.force && cache && Date.now() - cache.at < TTL_MS) {
    return cache.data;
  }
  if (!inFlight) {
    inFlight = fetchStatus().finally(() => {
      inFlight = null;
    });
  }
  const data = await inFlight;
  if (data) cache = { at: Date.now(), data };
  return data;
}

export function clearSubscriptionStatusCache() {
  cache = null;
}

export function canWriteFromStatus(s: SubscriptionStatus | null): boolean {
  if (!s) return false;
  if (s.is_super_admin) return true;
  return s.status === "active" || s.status === "expiring" || s.status === "grace";
}

export function useServerSubscriptionStatus() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(
    cache?.data ?? null,
  );
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let mounted = true;
    getServerSubscriptionStatus()
      .then((s) => {
        if (mounted) setStatus(s);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return {
    status,
    loading,
    canWrite: canWriteFromStatus(status),
    refresh: () => getServerSubscriptionStatus({ force: true }).then(setStatus),
  };
}
