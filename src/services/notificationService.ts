/**
 * Notification Service — Frontend (safe) layer
 *
 * Responsibilities:
 * - Queue a notification row in the DB
 * - Invoke the backend edge function to dispatch (SMS/Email)
 * - NEVER expose API keys — all sending happens server-side
 * - NEVER block the caller — all methods fire-and-forget
 */

import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("NotificationService");

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const EDGE_FN_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/send-notification`;

export interface SaleItemDetail {
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
}

export interface SaleNotificationPayload {
  invoice_number: string;
  customer_name: string;
  customer_phone?: string | null;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  sale_date: string;
  sale_id?: string;
  items?: SaleItemDetail[];
  dealer_name?: string;
}

export interface DailySummaryPayload {
  date: string;
  total_sales: number;
  total_revenue: number;
  total_profit: number;
}

interface NotificationSettings {
  enable_sale_sms: boolean;
  enable_sale_email: boolean;
  enable_daily_summary_sms: boolean;
  enable_daily_summary_email: boolean;
  owner_phone: string | null;
  owner_email: string | null;
}

async function getSettings(dealerId: string): Promise<NotificationSettings | null> {
  const { data, error } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("dealer_id", dealerId)
    .maybeSingle();

  if (error) {
    log.warn("Could not fetch notification settings:", error.message);
    return null;
  }
  return data;
}

async function queueAndDispatch(
  dealerId: string,
  channel: "sms" | "email",
  type: "sale_created" | "daily_summary",
  payload: Record<string, unknown>,
  recipient: string,
): Promise<void> {
  // 1. Insert notification row (for audit trail & retry capability)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notif, error: insertErr } = await (supabase as any)
    .from("notifications")
    .insert({
      dealer_id: dealerId,
      channel,
      type,
      payload,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !notif) {
    log.warn(`Failed to queue ${channel} notification:`, insertErr?.message);
    return;
  }

  // 2. Get auth token to call edge function
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // 3. Fire-and-forget: call edge function (server-side sends SMS/Email)
  fetch(EDGE_FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      notification_id: notif.id,
      dealer_id: dealerId,
      channel,
      type,
      payload,
      recipient,
    }),
  })
    .then((res) => {
      if (!res.ok) log.warn(`Edge function returned ${res.status} for ${notif.id}`);
      else log.info(`Dispatched ${channel} notification ${notif.id}`);
    })
    .catch((err) => log.error("Edge function call failed (sale unaffected):", err));
}

export const notificationService = {
  /**
   * Notify owner about a new sale.
   * Non-blocking — sale must never fail because of this.
   */
  notifySaleCreated(
    dealerId: string,
    payload: SaleNotificationPayload,
  ): void {
    // Intentionally not awaited
    (async () => {
      try {
        const settings = await getSettings(dealerId);
        if (!settings) return;

        const tasks: Promise<void>[] = [];

        if (settings.enable_sale_sms && settings.owner_phone) {
          tasks.push(
            queueAndDispatch(dealerId, "sms", "sale_created", payload as unknown as Record<string, unknown>, settings.owner_phone),
          );
        }

        if (settings.enable_sale_email && settings.owner_email) {
          tasks.push(
            queueAndDispatch(dealerId, "email", "sale_created", payload as unknown as Record<string, unknown>, settings.owner_email),
          );
        }

        // Also send SMS to the customer's own phone if available
        if (settings.enable_sale_sms && payload.customer_phone) {
          tasks.push(
            queueAndDispatch(dealerId, "sms", "sale_created", payload as unknown as Record<string, unknown>, payload.customer_phone),
          );
        }

        if (tasks.length === 0) {
          log.info("No sale notification channels configured for dealer", dealerId);
          return;
        }

        await Promise.allSettled(tasks);
      } catch (err) {
        // Swallow ALL errors — notifications must never affect sales
        log.error("notifySaleCreated error (sale unaffected):", err);
      }
    })();
  },

  /**
   * Send daily summary notification.
   * Typically called from a scheduled job / edge function.
   */
  async notifyDailySummary(
    dealerId: string,
    payload: DailySummaryPayload,
  ): Promise<void> {
    try {
      const settings = await getSettings(dealerId);
      if (!settings) return;

      const tasks: Promise<void>[] = [];

      if (settings.enable_daily_summary_sms && settings.owner_phone) {
        tasks.push(
          queueAndDispatch(dealerId, "sms", "daily_summary", payload as unknown as Record<string, unknown>, settings.owner_phone),
        );
      }

      if (settings.enable_daily_summary_email && settings.owner_email) {
        tasks.push(
          queueAndDispatch(dealerId, "email", "daily_summary", payload as unknown as Record<string, unknown>, settings.owner_email),
        );
      }

      await Promise.allSettled(tasks);
    } catch (err) {
      log.error("notifyDailySummary error:", err);
    }
  },
};
