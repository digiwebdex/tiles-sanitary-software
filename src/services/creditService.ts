/**
 * Credit Control Service — VPS-backed.
 *
 * Pure helpers (status classification) stay client-side; aggregation is
 * server-side via /api/credit/report.
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export type CreditStatus = "safe" | "near" | "exceeded" | "no_limit";

export interface CustomerCreditInfo {
  customer_id: string;
  customer_name: string;
  credit_limit: number;
  max_overdue_days: number;
  current_outstanding: number;
  oldest_due_date: string | null;
  overdue_days: number;
  status: CreditStatus;
  utilization_pct: number;
}

export interface CreditCheckResult {
  status: CreditStatus;
  current_outstanding: number;
  projected_outstanding: number;
  credit_limit: number;
  overdue_days: number;
  max_overdue_days: number;
  is_overdue_violated: boolean;
  is_credit_exceeded: boolean;
}

/** Determine badge status from utilization (pure helper). */
export function getCreditStatus(outstanding: number, creditLimit: number): CreditStatus {
  if (creditLimit <= 0) return "no_limit";
  const pct = outstanding / creditLimit;
  if (outstanding > creditLimit) return "exceeded";
  if (pct >= 0.8) return "near";
  return "safe";
}

async function vpsJson<T>(path: string): Promise<T> {
  const res = await vpsAuthedFetch(path);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

/** Get full credit info for all customers of a dealer (for Credit Report). */
export async function getDealerCreditReport(dealerId: string): Promise<CustomerCreditInfo[]> {
  const body = await vpsJson<{ rows: CustomerCreditInfo[] }>(
    `/api/credit/report?dealerId=${encodeURIComponent(dealerId)}`,
  );
  return body.rows ?? [];
}
