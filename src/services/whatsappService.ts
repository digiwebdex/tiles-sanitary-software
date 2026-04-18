import { supabase } from "@/integrations/supabase/client";
import { assertDealerId } from "@/lib/tenancy";
import type { Database } from "@/integrations/supabase/types";

export type WhatsAppMessageType =
  Database["public"]["Enums"]["whatsapp_message_type"];
export type WhatsAppMessageStatus =
  Database["public"]["Enums"]["whatsapp_message_status"];

export interface WhatsAppMessageLog {
  id: string;
  dealer_id: string;
  message_type: WhatsAppMessageType;
  source_type: string;
  source_id: string | null;
  recipient_phone: string;
  recipient_name: string | null;
  template_key: string | null;
  message_text: string;
  payload_snapshot: Record<string, unknown>;
  status: WhatsAppMessageStatus;
  provider: string;
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  failed_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface CreateLogInput {
  dealer_id: string;
  message_type: WhatsAppMessageType;
  source_type: string;
  source_id: string | null;
  recipient_phone: string;
  recipient_name?: string | null;
  template_key?: string | null;
  message_text: string;
  payload_snapshot?: Record<string, unknown>;
  status?: WhatsAppMessageStatus;
}

const PAGE_SIZE = 25;

/**
 * Normalize a phone number for wa.me click-to-chat.
 * - Strips spaces, dashes, parentheses, leading "+"
 * - If starts with "0" and length is 11 (BD local), converts to "880…"
 * - Returns digits-only string ready for `https://wa.me/<digits>`
 */
export function normalizePhoneForWa(raw: string): string {
  let p = (raw ?? "").replace(/[\s\-()+]/g, "");
  if (!p) return "";
  // Bangladesh local "01XXXXXXXXX" -> "8801XXXXXXXXX"
  if (p.length === 11 && p.startsWith("0")) {
    p = "88" + p;
  }
  return p.replace(/\D/g, "");
}

/** Quick validity check: 8-15 digits after normalization. */
export function isValidWaPhone(raw: string): boolean {
  const n = normalizePhoneForWa(raw);
  return n.length >= 8 && n.length <= 15;
}

/** Build a wa.me click-to-chat URL with pre-filled text. */
export function buildWaLink(phone: string, text: string): string {
  const digits = normalizePhoneForWa(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/* ------------------------------------------------------------------ */
/*  TEMPLATES                                                         */
/* ------------------------------------------------------------------ */

interface QuotationTemplateData {
  dealerName: string;
  customerName?: string | null;
  quotationNo: string;
  totalAmount: number;
  validUntil?: string | null;
  itemCount: number;
}

interface InvoiceTemplateData {
  dealerName: string;
  customerName?: string | null;
  invoiceNo: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  saleDate?: string | null;
}

interface PaymentReceiptTemplateData {
  dealerName: string;
  customerName?: string | null;
  receiptNo: string;
  amount: number;
  remainingDue: number;
  date: string; // human-readable
}

interface OverdueReminderTemplateData {
  dealerName: string;
  dealerPhone?: string | null;
  customerName?: string | null;
  outstanding: number;
  daysOverdue: number;
  oldestInvoiceDate?: string | null;
}

interface DeliveryUpdateTemplateData {
  dealerName: string;
  customerName?: string | null;
  deliveryNo: string;
  status: string; // "Pending" | "In Transit" | "Delivered"
  itemCount: number;
  deliveryDate?: string | null;
  invoiceNo?: string | null;
  receiverName?: string | null;
}

const fmtBdt = (n: number) =>
  `৳${Number(n || 0).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function buildQuotationMessage(d: QuotationTemplateData): string {
  const greeting = d.customerName ? `Dear ${d.customerName},` : "Dear Customer,";
  const validity = d.validUntil ? `\nValid until: ${d.validUntil}` : "";
  return [
    greeting,
    "",
    `Please find your quotation from ${d.dealerName}.`,
    "",
    `Quotation No: ${d.quotationNo}`,
    `Items: ${d.itemCount}`,
    `Total: ${fmtBdt(d.totalAmount)}${validity}`,
    "",
    "Please confirm to proceed with your order.",
    "",
    `Thanks,\n${d.dealerName}`,
  ].join("\n");
}

export function buildInvoiceMessage(d: InvoiceTemplateData): string {
  const greeting = d.customerName ? `Dear ${d.customerName},` : "Dear Customer,";
  const dateLine = d.saleDate ? `\nDate: ${d.saleDate}` : "";
  const dueLine =
    d.dueAmount > 0
      ? `\nDue: ${fmtBdt(d.dueAmount)}`
      : "\nStatus: Fully Paid ✅";
  return [
    greeting,
    "",
    `Your invoice from ${d.dealerName}:`,
    "",
    `Invoice No: ${d.invoiceNo}${dateLine}`,
    `Total: ${fmtBdt(d.totalAmount)}`,
    `Paid: ${fmtBdt(d.paidAmount)}${dueLine}`,
    "",
    "Thank you for your business.",
    "",
    `${d.dealerName}`,
  ].join("\n");
}

export function buildPaymentReceiptMessage(d: PaymentReceiptTemplateData): string {
  const greeting = d.customerName ? `Dear ${d.customerName},` : "Dear Customer,";
  const dueLine =
    d.remainingDue > 0
      ? `Remaining Due: ${fmtBdt(d.remainingDue)}`
      : "All dues cleared ✅";
  return [
    greeting,
    "",
    `We have received your payment. Thank you!`,
    "",
    `Receipt No: ${d.receiptNo}`,
    `Date: ${d.date}`,
    `Amount Received: ${fmtBdt(d.amount)}`,
    dueLine,
    "",
    `Thanks,\n${d.dealerName}`,
  ].join("\n");
}

export function buildOverdueReminderMessage(d: OverdueReminderTemplateData): string {
  const greeting = d.customerName ? `Dear ${d.customerName},` : "Dear Customer,";
  const oldestLine = d.oldestInvoiceDate
    ? `\nOldest unpaid invoice: ${d.oldestInvoiceDate}`
    : "";
  const daysLine = d.daysOverdue > 0 ? `\nOverdue: ${d.daysOverdue} days` : "";
  const contactLine = d.dealerPhone ? `\n\nFor any questions, call ${d.dealerPhone}.` : "";
  return [
    greeting,
    "",
    `This is a friendly reminder from ${d.dealerName}.`,
    "",
    `Outstanding balance: ${fmtBdt(d.outstanding)}${daysLine}${oldestLine}`,
    "",
    `Please arrange the payment at your earliest convenience.${contactLine}`,
    "",
    `Thanks,\n${d.dealerName}`,
  ].join("\n");
}

export function buildDeliveryUpdateMessage(d: DeliveryUpdateTemplateData): string {
  const greeting = d.customerName ? `Dear ${d.customerName},` : "Dear Customer,";
  const dateLine = d.deliveryDate ? `\nDate: ${d.deliveryDate}` : "";
  const invLine = d.invoiceNo ? `\nInvoice: ${d.invoiceNo}` : "";
  const recvLine = d.receiverName ? `\nReceiver: ${d.receiverName}` : "";
  return [
    greeting,
    "",
    `Delivery update from ${d.dealerName}:`,
    "",
    `Delivery No: ${d.deliveryNo}${invLine}${dateLine}`,
    `Items: ${d.itemCount}`,
    `Status: ${d.status}${recvLine}`,
    "",
    "Thank you for your business.",
    "",
    `${d.dealerName}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  SETTINGS                                                          */
/* ------------------------------------------------------------------ */

export interface WhatsAppSettings {
  dealer_id: string;
  enable_quotation_share: boolean;
  enable_invoice_share: boolean;
  enable_payment_receipt: boolean;
  enable_overdue_reminder: boolean;
  enable_delivery_update: boolean;
  template_quotation_share: string | null;
  template_invoice_share: string | null;
  template_payment_receipt: string | null;
  template_overdue_reminder: string | null;
  template_delivery_update: string | null;
  prefer_manual_send: boolean;
  default_country_code: string;
}

export const DEFAULT_WHATSAPP_SETTINGS = (
  dealerId: string,
): WhatsAppSettings => ({
  dealer_id: dealerId,
  enable_quotation_share: true,
  enable_invoice_share: true,
  enable_payment_receipt: true,
  enable_overdue_reminder: true,
  enable_delivery_update: true,
  template_quotation_share: null,
  template_invoice_share: null,
  template_payment_receipt: null,
  template_overdue_reminder: null,
  template_delivery_update: null,
  prefer_manual_send: true,
  default_country_code: "880",
});

/** Map of message_type -> enable flag key */
const ENABLE_KEY: Record<WhatsAppMessageType, keyof WhatsAppSettings> = {
  quotation_share: "enable_quotation_share",
  invoice_share: "enable_invoice_share",
  payment_receipt: "enable_payment_receipt",
  overdue_reminder: "enable_overdue_reminder",
  delivery_update: "enable_delivery_update",
};

export function isMessageTypeEnabled(
  settings: WhatsAppSettings | null | undefined,
  type: WhatsAppMessageType,
): boolean {
  if (!settings) return true; // permissive default when no row yet
  return Boolean(settings[ENABLE_KEY[type]]);
}

/* ------------------------------------------------------------------ */
/*  SERVICE                                                            */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export const whatsappService = {
  /** Create a log row. Default status = 'manual_handoff' (wa.me model). */
  async createLog(input: CreateLogInput): Promise<WhatsAppMessageLog> {
    await assertDealerId(input.dealer_id);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;

    const row = {
      dealer_id: input.dealer_id,
      message_type: input.message_type,
      source_type: input.source_type,
      source_id: input.source_id,
      recipient_phone: input.recipient_phone,
      recipient_name: input.recipient_name ?? null,
      template_key: input.template_key ?? null,
      message_text: input.message_text,
      payload_snapshot: (input.payload_snapshot ?? {}) as unknown as Database["public"]["Tables"]["whatsapp_message_logs"]["Insert"]["payload_snapshot"],
      status: input.status ?? "manual_handoff",
      provider: "wa_click_to_chat",
      sent_at:
        input.status === "sent" || !input.status
          ? new Date().toISOString()
          : null,
      created_by: userId,
    };

    const { data, error } = await supabase
      .from("whatsapp_message_logs")
      .insert(row)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return data as WhatsAppMessageLog;
  },

  async list(opts: {
    dealerId: string;
    page?: number;
    messageType?: WhatsAppMessageType | "all";
    status?: WhatsAppMessageStatus | "all";
    search?: string;
  }): Promise<{ rows: WhatsAppMessageLog[]; total: number }> {
    const page = opts.page ?? 1;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from("whatsapp_message_logs")
      .select("*", { count: "exact" })
      .eq("dealer_id", opts.dealerId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (opts.messageType && opts.messageType !== "all") {
      q = q.eq("message_type", opts.messageType);
    }
    if (opts.status && opts.status !== "all") {
      q = q.eq("status", opts.status);
    }
    if (opts.search && opts.search.trim()) {
      const s = opts.search.trim();
      q = q.or(`recipient_phone.ilike.%${s}%,recipient_name.ilike.%${s}%`);
    }

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as WhatsAppMessageLog[], total: count ?? 0 };
  },

  async markFailed(id: string, errorMessage: string): Promise<void> {
    const { error } = await supabase
      .from("whatsapp_message_logs")
      .update({
        status: "failed",
        error_message: errorMessage,
        failed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  /** Mark a log row as 'sent' (used by the dealer to confirm WhatsApp send). */
  async markSent(id: string): Promise<void> {
    const { error } = await supabase
      .from("whatsapp_message_logs")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: null,
        failed_at: null,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  /** Aggregate counts for dashboard widget (today). */
  async getTodayStats(dealerId: string): Promise<{
    sent: number;
    handoff: number;
    failed: number;
    total: number;
  }> {
    const startIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const { data, error } = await supabase
      .from("whatsapp_message_logs")
      .select("status")
      .eq("dealer_id", dealerId)
      .gte("created_at", startIso);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { status: WhatsAppMessageStatus }[];
    const stats = { sent: 0, handoff: 0, failed: 0, total: rows.length };
    for (const r of rows) {
      if (r.status === "sent") stats.sent += 1;
      else if (r.status === "manual_handoff") stats.handoff += 1;
      else if (r.status === "failed") stats.failed += 1;
    }
    return stats;
  },

  /* ----- SETTINGS ----- */
  async getSettings(dealerId: string): Promise<WhatsAppSettings> {
    const { data, error } = await sb
      .from("whatsapp_settings")
      .select("*")
      .eq("dealer_id", dealerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return DEFAULT_WHATSAPP_SETTINGS(dealerId);
    return data as WhatsAppSettings;
  },

  async upsertSettings(settings: WhatsAppSettings): Promise<void> {
    await assertDealerId(settings.dealer_id);
    const { error } = await sb
      .from("whatsapp_settings")
      .upsert(settings, { onConflict: "dealer_id" });
    if (error) throw new Error(error.message);
  },
};

export const PAGE_SIZE_WA = PAGE_SIZE;
