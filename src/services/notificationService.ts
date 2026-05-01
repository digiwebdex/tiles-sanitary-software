/**
 * Notification Service — Frontend (safe) layer
 *
 * Phase 3U-28: fully migrated off the Supabase edge function.
 * All dispatch goes through the VPS endpoint which handles plan-gating,
 * templating, status tracking, and the actual SMTP / BulkSMSBD calls.
 *
 * Responsibilities:
 *   - Fetch the dealer's notification preferences from VPS
 *   - Fan out to VPS /api/notifications/dispatch for each enabled channel
 *   - NEVER throw to the caller — sales / collections must never fail
 *     because of notifications
 */

import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { createLogger } from "@/lib/logger";

const log = createLogger("NotificationService");

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

async function getSettings(): Promise<NotificationSettings | null> {
  try {
    const res = await vpsAuthedFetch("/api/notifications/settings");
    if (!res.ok) {
      log.warn("Could not fetch notification settings:", res.status);
      return null;
    }
    return (await res.json()) as NotificationSettings | null;
  } catch (err) {
    log.warn("notification settings fetch failed:", (err as Error).message);
    return null;
  }
}

async function dispatch(
  channel: "sms" | "email",
  type: "sale_created" | "daily_summary" | "payment_reminder",
  recipient: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await vpsAuthedFetch("/api/notifications/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, type, recipient, payload }),
    });
    if (!res.ok) {
      log.warn(`dispatch ${channel}/${type} → ${recipient} returned`, res.status);
      return false;
    }
    const body = await res.json().catch(() => ({}));
    return Boolean(body?.success);
  } catch (err) {
    log.error(`dispatch ${channel}/${type} failed:`, err);
    return false;
  }
}

export const notificationService = {
  /**
   * Notify owner about a new sale.
   * Non-blocking — sale must never fail because of this.
   */
  notifySaleCreated(
    _dealerId: string,
    payload: SaleNotificationPayload,
  ): void {
    // Intentionally not awaited
    (async () => {
      try {
        const settings = await getSettings();
        if (!settings) return;

        const tasks: Promise<boolean>[] = [];
        const p = payload as unknown as Record<string, unknown>;

        if (settings.enable_sale_sms && settings.owner_phone) {
          tasks.push(dispatch("sms", "sale_created", settings.owner_phone, p));
        }
        if (settings.enable_sale_email && settings.owner_email) {
          tasks.push(dispatch("email", "sale_created", settings.owner_email, p));
        }
        // SMS to the customer's own phone if available
        if (settings.enable_sale_sms && payload.customer_phone) {
          tasks.push(dispatch("sms", "sale_created", payload.customer_phone, p));
        }

        if (tasks.length === 0) {
          log.info("No sale notification channels configured");
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
   * Typically called from a scheduled job.
   */
  async notifyDailySummary(
    _dealerId: string,
    payload: DailySummaryPayload,
  ): Promise<void> {
    try {
      const settings = await getSettings();
      if (!settings) return;

      const tasks: Promise<boolean>[] = [];
      const p = payload as unknown as Record<string, unknown>;

      if (settings.enable_daily_summary_sms && settings.owner_phone) {
        tasks.push(dispatch("sms", "daily_summary", settings.owner_phone, p));
      }
      if (settings.enable_daily_summary_email && settings.owner_email) {
        tasks.push(dispatch("email", "daily_summary", settings.owner_email, p));
      }
      await Promise.allSettled(tasks);
    } catch (err) {
      log.error("notifyDailySummary error:", err);
    }
  },

  /**
   * Send payment reminder SMS to a customer with outstanding balance.
   * Non-blocking — collection flow must never fail because of this.
   */
  async sendPaymentReminder(
    _dealerId: string,
    payload: {
      customer_name: string;
      customer_phone: string;
      outstanding: number;
      last_payment_date?: string | null;
      dealer_name?: string;
      dealer_phone?: string;
    },
  ): Promise<boolean> {
    try {
      if (!payload.customer_phone) {
        log.warn("No phone number for payment reminder");
        return false;
      }
      return await dispatch(
        "sms",
        "payment_reminder",
        payload.customer_phone,
        payload as unknown as Record<string, unknown>,
      );
    } catch (err) {
      log.error("sendPaymentReminder error:", err);
      return false;
    }
  },
};
