import { supabase } from "@/integrations/supabase/client";
import { addMonths, format } from "date-fns";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

async function vpsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

interface RecordPaymentInput {
  subscription_id: string;
  dealer_id: string;
  amount: number;
  payment_date: string;
  payment_method: "cash" | "bank" | "mobile_banking";
  payment_status: "paid" | "partial" | "pending";
  collected_by: string;
  note?: string;
  /** Used to extend subscription on full payment */
  extend_months?: number;
  /** Billing cycle for this renewal period */
  billing_cycle?: "monthly" | "yearly";
}

/**
 * Records a subscription payment.
 * – Prevents duplicate full payments for the same subscription period.
 * – On full payment: extends subscription end_date and sets status = active.
 * – Yearly billing: 30% discount only applies on first yearly renewal per dealer.
 *   Subsequent yearly renewals are charged at full price (monthly_price × 12).
 * – Logs the action in audit_logs.
 */
export async function recordSubscriptionPayment(input: RecordPaymentInput) {
  const {
    subscription_id,
    dealer_id,
    amount,
    payment_date,
    payment_method,
    payment_status,
    collected_by,
    note,
    extend_months = 1,
    billing_cycle = "monthly",
  } = input;

  // VPS path: when running against the self-hosted backend (e.g. live custom
  // domain), Supabase RLS does not apply — record via authed VPS endpoint.
  if (env.AUTH_BACKEND === "vps") {
    const result = await vpsJson<{
      payment: { id: string };
      yearly_discount_applied: boolean;
    }>("/api/subscriptions/payments", {
      method: "POST",
      body: JSON.stringify({
        subscription_id,
        dealer_id,
        amount,
        payment_date,
        payment_method,
        payment_status,
        note,
        extend_months,
        billing_cycle,
      }),
    });
    return {
      payment: result.payment,
      yearlyDiscountApplied: result.yearly_discount_applied,
    };
  }

  // 1. Duplicate check: prevent full payment if one already exists for this subscription
  if (payment_status === "paid") {
    const { data: existing, error: dupError } = await supabase
      .from("subscription_payments")
      .select("id")
      .eq("subscription_id", subscription_id)
      .eq("payment_status", "paid" as any)
      .limit(1);

    if (dupError) throw new Error(dupError.message);

    if (existing && existing.length > 0) {
      throw new Error(
        "A full payment has already been recorded for this subscription period. Use 'Edit' to extend the end date or create a new subscription instead."
      );
    }
  }

  // 2. Determine if yearly discount is eligible
  // Discount applies ONLY if dealer has NEVER had yearly_discount_applied = true before
  let yearlyDiscountApplied = false;
  if (billing_cycle === "yearly" && payment_status === "paid") {
    const { data: prevYearly, error: prevErr } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("dealer_id", dealer_id)
      .eq("yearly_discount_applied", true)
      .limit(1);

    if (prevErr) throw new Error(prevErr.message);

    // No previous yearly discount found → first time, discount applies
    yearlyDiscountApplied = !prevYearly || prevYearly.length === 0;
  }

  // 3. Insert payment record
  const { data: payment, error: insertError } = await supabase
    .from("subscription_payments")
    .insert({
      subscription_id,
      dealer_id,
      amount,
      payment_date,
      payment_method: payment_method as any,
      payment_status: payment_status as any,
      collected_by,
      note: note || null,
    })
    .select("id")
    .single();

  if (insertError) throw new Error(insertError.message);

  // 4. If full payment → extend subscription & activate
  if (payment_status === "paid") {
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("end_date, start_date")
      .eq("id", subscription_id)
      .single();

    if (subError) throw new Error(subError.message);

    const baseDate = sub.end_date
      ? new Date(sub.end_date)
      : new Date(sub.start_date);

    const newEndDate = format(addMonths(baseDate, extend_months), "yyyy-MM-dd");

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        end_date: newEndDate,
        status: "active" as any,
        billing_cycle: billing_cycle as any,
        yearly_discount_applied: yearlyDiscountApplied,
      })
      .eq("id", subscription_id);

    if (updateError) throw new Error(updateError.message);
  }

  // 5. Audit log
  await supabase.from("audit_logs").insert({
    dealer_id,
    user_id: collected_by,
    action: "SUBSCRIPTION_PAYMENT_RECORDED",
    table_name: "subscription_payments",
    record_id: payment.id,
    new_data: {
      subscription_id,
      amount,
      payment_date,
      payment_method,
      payment_status,
      billing_cycle,
      yearly_discount_applied: yearlyDiscountApplied,
      note,
    } as any,
  });

  return { payment, yearlyDiscountApplied };
}

/**
 * Check if a dealer is eligible for the 30% yearly discount.
 * Returns true if they have NEVER received a yearly discount before.
 */
export async function checkYearlyDiscountEligibility(dealer_id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("dealer_id", dealer_id)
    .eq("yearly_discount_applied", true)
    .limit(1);

  if (error) throw new Error(error.message);
  return !data || data.length === 0;
}
