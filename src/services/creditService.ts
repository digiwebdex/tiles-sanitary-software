/**
 * Credit Control Service
 * Calculates customer outstanding, overdue days, credit status, and logs overrides.
 */

import { supabase } from "@/integrations/supabase/client";

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

/** Determine badge status from utilization */
export function getCreditStatus(outstanding: number, creditLimit: number): CreditStatus {
  if (creditLimit <= 0) return "no_limit";
  const pct = outstanding / creditLimit;
  if (outstanding > creditLimit) return "exceeded";
  if (pct >= 0.8) return "near";
  return "safe";
}

/** Calculate a customer's current outstanding from the customer_ledger */
async function getCustomerOutstanding(customerId: string, dealerId: string): Promise<number> {
  const { data, error } = await supabase
    .from("customer_ledger")
    .select("amount, type")
    .eq("customer_id", customerId)
    .eq("dealer_id", dealerId);

  if (error || !data) return 0;

  const total = data.reduce((sum, row) => {
    const amt = Number(row.amount);
    if (row.type === "sale") return sum + amt;
    if (row.type === "payment" || row.type === "refund") return sum - amt;
    if (row.type === "adjustment") return sum + amt;
    return sum;
  }, 0);

  return Math.max(0, Math.round(total * 100) / 100);
}

/** Find oldest unpaid/partial-payment sale date */
async function getOldestUnpaidSaleDate(customerId: string, dealerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("sales")
    .select("sale_date, due_amount")
    .eq("customer_id", customerId)
    .eq("dealer_id", dealerId)
    .gt("due_amount", 0)
    .order("sale_date", { ascending: true })
    .limit(1);

  if (error || !data?.length) return null;
  return data[0].sale_date;
}

function calcOverdueDays(oldestDate: string | null): number {
  if (!oldestDate) return 0;
  const msPerDay = 86_400_000;
  const diff = Date.now() - new Date(oldestDate).getTime();
  return Math.max(0, Math.floor(diff / msPerDay));
}

/** Full credit check before a new sale — returns what to show in the UI */
export async function checkCreditBeforeSale(
  customerId: string,
  dealerId: string,
  newDueAmount: number,
): Promise<CreditCheckResult> {
  const [{ data: customer }, outstanding, oldestDate] = await Promise.all([
    supabase
      .from("customers")
      .select("credit_limit, max_overdue_days")
      .eq("id", customerId)
      .single(),
    getCustomerOutstanding(customerId, dealerId),
    getOldestUnpaidSaleDate(customerId, dealerId),
  ]);

  const credit_limit = Number(customer?.credit_limit ?? 0);
  const max_overdue_days = Number(customer?.max_overdue_days ?? 0);
  const overdue_days = calcOverdueDays(oldestDate);
  const projected = outstanding + newDueAmount;

  const is_credit_exceeded = credit_limit > 0 && projected > credit_limit;
  const is_overdue_violated = max_overdue_days > 0 && overdue_days > max_overdue_days;
  const status = getCreditStatus(projected, credit_limit);

  return {
    status,
    current_outstanding: outstanding,
    projected_outstanding: projected,
    credit_limit,
    overdue_days,
    max_overdue_days,
    is_overdue_violated,
    is_credit_exceeded,
  };
}

/** Get full credit info for all customers of a dealer (for Credit Report) */
export async function getDealerCreditReport(dealerId: string): Promise<CustomerCreditInfo[]> {
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, credit_limit, max_overdue_days, status")
    .eq("dealer_id", dealerId)
    .eq("status", "active")
    .order("name");

  if (error || !customers?.length) return [];

  const results = await Promise.all(
    customers.map(async (c) => {
      const [outstanding, oldestDate] = await Promise.all([
        getCustomerOutstanding(c.id, dealerId),
        getOldestUnpaidSaleDate(c.id, dealerId),
      ]);

      const creditLimit = Number(c.credit_limit);
      const overdue_days = calcOverdueDays(oldestDate);
      const status = getCreditStatus(outstanding, creditLimit);
      const utilization_pct = creditLimit > 0 ? Math.round((outstanding / creditLimit) * 100) : 0;

      return {
        customer_id: c.id,
        customer_name: c.name,
        credit_limit: creditLimit,
        max_overdue_days: Number(c.max_overdue_days),
        current_outstanding: outstanding,
        oldest_due_date: oldestDate,
        overdue_days,
        status,
        utilization_pct,
      } satisfies CustomerCreditInfo;
    })
  );

  // Sort by highest outstanding
  return results.sort((a, b) => b.current_outstanding - a.current_outstanding);
}

/** Log a credit override when owner approves exceeding the limit */
export async function logCreditOverride(params: {
  dealer_id: string;
  customer_id: string;
  sale_id: string;
  override_reason: string;
  overridden_by: string;
  credit_limit_at_time: number;
  outstanding_at_time: number;
  new_due_at_time: number;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("credit_overrides").insert(params);
}
