import { supabase } from "@/integrations/supabase/client";
import { addMonths, addYears, format } from "date-fns";

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
}

/**
 * Records a subscription payment.
 * – Prevents duplicate full payments for the same subscription period.
 * – On full payment: extends subscription end_date and sets status = active.
 * – On partial: keeps status as-is (pending).
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
  } = input;

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
        "A full payment has already been recorded for this subscription period. Use 'Extend' or create a new subscription instead."
      );
    }
  }

  // 2. Insert payment record
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

  // 3. If full payment → extend subscription & activate
  if (payment_status === "paid") {
    // Fetch current subscription to calculate new end date
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
      })
      .eq("id", subscription_id);

    if (updateError) throw new Error(updateError.message);
  }

  // 4. Audit log
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
      note,
    } as any,
  });

  return payment;
}
