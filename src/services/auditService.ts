import { supabase } from "@/integrations/supabase/client";
import { vpsAuthedFetch, vpsTokenStore } from "@/lib/vpsAuthClient";

interface AuditLogInput {
  dealer_id: string;
  user_id?: string | null;
  action: string;
  table_name: string;
  record_id: string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
}

/**
 * Logs an audit entry.
 *
 * P1 dual-write strategy:
 *   1) High-value events (auth, restore, role grants, sale cancel, stock
 *      adjust, refunds, price changes) are sent to the VPS endpoint
 *      `/api/audit-logs` so dealer_id, user_id, IP and UA are server-bound
 *      and unforgeable.
 *   2) The Supabase insert is kept as a fallback so existing dashboards
 *      and RLS-readable trails continue to work during the migration.
 *
 * Either path can fail silently — audit must never break a business action.
 */

const HIGH_VALUE_PREFIXES = [
  "AUTH_",
  "ROLE_",
  "SUBSCRIPTION_",
  "RESTORE_",
  "BACKUP_",
  "SALE_CANCEL",
  "STOCK_ADJUST",
  "PRICE_CHANGE",
  "REFUND",
  "APPROVAL_",
  "DEALER_",
];

function isHighValue(action: string): boolean {
  const upper = action.toUpperCase();
  return HIGH_VALUE_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

async function writeToVpsBackend(input: AuditLogInput): Promise<boolean> {
  // Skip if the user is not signed into the VPS auth side at all.
  if (!vpsTokenStore.access) return false;
  try {
    const res = await vpsAuthedFetch("/api/audit-logs", {
      method: "POST",
      body: JSON.stringify({
        action: input.action,
        table_name: input.table_name,
        record_id: input.record_id,
        old_data: input.old_data ?? null,
        new_data: input.new_data ?? null,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function writeToSupabaseFallback(input: AuditLogInput) {
  let userId = input.user_id ?? null;
  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }
  const { error } = await supabase.from("audit_logs").insert([
    {
      dealer_id: input.dealer_id,
      user_id: userId,
      action: input.action,
      table_name: input.table_name,
      record_id: input.record_id,
      old_data: (input.old_data as any) ?? null,
      new_data: (input.new_data as any) ?? null,
      ip_address: null,
      user_agent: navigator?.userAgent ?? null,
    },
  ]);
  if (error) console.error("Audit log fallback failed:", error.message);
}

export async function logAudit(input: AuditLogInput) {
  // Always try VPS first for high-value events; the Supabase write is
  // best-effort fallback so dashboards keep showing the trail until the
  // VPS-only viewer ships.
  let backendOk = false;
  if (isHighValue(input.action)) {
    backendOk = await writeToVpsBackend(input);
  }

  // Dual-write: low-value events skip the network and go to Supabase
  // directly; high-value events also write to Supabase unless the
  // backend wrote successfully (avoid double-recording where possible).
  if (!backendOk || !isHighValue(input.action)) {
    try {
      await writeToSupabaseFallback(input);
    } catch (err) {
      console.error("Audit log fallback threw:", (err as Error).message);
    }
  }
}

/**
 * Helper used by tests. Not exported in production paths.
 * @internal
 */
export const __auditInternals = { isHighValue };
