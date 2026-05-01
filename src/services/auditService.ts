import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

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
 * Logs an audit entry — VPS only.
 *
 * The backend trusts ONLY the server-derived dealer_id, user_id, IP, and
 * user-agent (see /api/audit-logs). Clients cannot spoof those fields.
 *
 * Audit must never break a business action — failures are swallowed and
 * logged to the console only.
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

export async function logAudit(input: AuditLogInput) {
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
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as any));
      console.warn(
        `[audit:write] ${input.action} (${res.status}):`,
        (body as any)?.error || res.statusText,
      );
    }
  } catch (err) {
    console.warn("[audit:write] network error:", (err as Error).message);
  }
}

/**
 * Helper used by tests. Not exported in production paths.
 * @internal
 */
export const __auditInternals = { isHighValue };
