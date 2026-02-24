import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface NotificationRequest {
  notification_id: string;
  dealer_id: string;
  channel: "sms" | "email";
  type: "sale_created" | "daily_summary" | "payment_reminder";
  payload: Record<string, unknown>;
  recipient: string;
}

// ─── SMTP helpers ────────────────────────────────────────────────────────────

const enc = (s: string) => new TextEncoder().encode(s + "\r\n");
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

async function readSmtpResponse(conn: Deno.Conn | Deno.TlsConn): Promise<string> {
  const buf = new Uint8Array(4096);
  let result = "";
  while (true) {
    const n = await conn.read(buf);
    if (n === null) break;
    result += dec(buf.subarray(0, n));
    if (result.includes("\r\n")) break;
  }
  return result.trim();
}

async function smtpCmd(conn: Deno.Conn | Deno.TlsConn, line: string): Promise<string> {
  await conn.write(enc(line));
  return await readSmtpResponse(conn);
}

async function sendSmtpEmail(opts: {
  from: string; to: string; subject: string; body: string;
}): Promise<void> {
  const host = Deno.env.get("SMTP_HOST");
  const port = parseInt(Deno.env.get("SMTP_PORT") || "587");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  const from = Deno.env.get("SMTP_FROM") || user;

  if (!host || !user || !pass) throw new Error("SMTP credentials not configured");

  const emailPayload =
    `From: ${from}\r\nTo: ${opts.to}\r\nSubject: ${opts.subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${opts.body}\r\n.`;

  if (port === 465) {
    const conn = await Deno.connectTls({ hostname: host, port });
    try {
      await readSmtpResponse(conn);
      await smtpCmd(conn, `EHLO ${host}`);
      await smtpCmd(conn, "AUTH LOGIN");
      await smtpCmd(conn, b64(user!));
      const authResp = await smtpCmd(conn, b64(pass));
      if (!authResp.startsWith("235")) throw new Error(`SMTP AUTH failed: ${authResp}`);
      const mf = await smtpCmd(conn, `MAIL FROM:<${from}>`);
      if (!mf.startsWith("250")) throw new Error(`MAIL FROM failed: ${mf}`);
      const rt = await smtpCmd(conn, `RCPT TO:<${opts.to}>`);
      if (!rt.startsWith("250")) throw new Error(`RCPT TO failed: ${rt}`);
      await smtpCmd(conn, "DATA");
      await smtpCmd(conn, emailPayload);
      await smtpCmd(conn, "QUIT");
    } finally {
      conn.close();
    }
  } else {
    // STARTTLS
    const plain = await Deno.connect({ hostname: host, port });
    await readSmtpResponse(plain);
    await plain.write(enc(`EHLO ${host}`));
    await readSmtpResponse(plain);
    const stResp = await smtpCmd(plain, "STARTTLS");
    if (!stResp.startsWith("220")) { plain.close(); throw new Error(`STARTTLS failed: ${stResp}`); }
    const tls = await Deno.startTls(plain, { hostname: host });
    try {
      await smtpCmd(tls, `EHLO ${host}`);
      await smtpCmd(tls, "AUTH LOGIN");
      await smtpCmd(tls, b64(user!));
      const authResp = await smtpCmd(tls, b64(pass));
      if (!authResp.startsWith("235")) throw new Error(`SMTP AUTH failed: ${authResp}`);
      const mf = await smtpCmd(tls, `MAIL FROM:<${from}>`);
      if (!mf.startsWith("250")) throw new Error(`MAIL FROM failed: ${mf}`);
      const rt = await smtpCmd(tls, `RCPT TO:<${opts.to}>`);
      if (!rt.startsWith("250")) throw new Error(`RCPT TO failed: ${rt}`);
      await smtpCmd(tls, "DATA");
      await smtpCmd(tls, emailPayload);
      await smtpCmd(tls, "QUIT");
    } finally {
      tls.close();
    }
  }
}

// ─── SMS via BulkSMSBD ───────────────────────────────────────────────────────

async function sendSMS(phone: string, message: string): Promise<{ success: boolean; response?: unknown; error?: string }> {
  const apiKey = Deno.env.get("BULKSMSBD_API_KEY");
  const apiUrl = Deno.env.get("BULKSMSBD_API_URL") ?? "http://bulksmsbd.net/api/smsapi";
  const senderId = Deno.env.get("BULKSMSBD_SENDER_ID");

  if (!apiKey || !senderId) return { success: false, error: "SMS credentials not configured" };

  const cleanPhone = phone.replace(/\D/g, "");
  const params = new URLSearchParams({ api_key: apiKey, type: "text", number: cleanPhone, senderid: senderId, message });

  try {
    const res = await fetch(`${apiUrl}?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const responseText = await res.text();
    console.log("[SMS] BulkSMSBD response:", responseText);
    if (responseText.includes("1701") || res.ok) return { success: true, response: responseText };
    return { success: false, error: `BulkSMSBD error: ${responseText}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SMS] Fetch error:", msg);
    return { success: false, error: msg };
  }
}

// ─── Message builders ────────────────────────────────────────────────────────

const PUBLISHED_URL = "https://tiles-sanitary-software.lovable.app";

function buildSaleMessage(payload: Record<string, unknown>, recipient: string): string {
  const inv = payload.invoice_number ?? "N/A";
  const customer = payload.customer_name ?? "Customer";
  const amount = payload.total_amount ?? 0;
  const paid = payload.paid_amount ?? 0;
  const due = payload.due_amount ?? 0;
  const saleId = payload.sale_id as string | undefined;
  const dealerName = payload.dealer_name as string | undefined;
  const items = payload.items as Array<{ name: string; quantity: number; unit: string; rate: number; total: number }> | undefined;
  const customerPhone = (payload.customer_phone as string | null) ?? null;

  const invoiceLink = saleId ? `\n\nInvoice: ${PUBLISHED_URL}/sales/${saleId}/invoice` : "";

  // Build items summary
  let itemsSummary = "";
  if (items && items.length > 0) {
    itemsSummary = "\n\nItems:\n" + items.map((item, i) =>
      `${i + 1}. ${item.name} - ${item.quantity} ${item.unit} x ${item.rate} = ${item.total} BDT`
    ).join("\n");
  }

  if (customerPhone && recipient === customerPhone) {
    return `${dealerName ? dealerName + "\n" : ""}Dear ${customer},\nThank you for your purchase!\n\nInvoice: ${inv}\nDate: ${payload.sale_date ?? ""}${itemsSummary}\n\nTotal: ${amount} BDT\nPaid: ${paid} BDT\nDue: ${due} BDT${invoiceLink}`;
  }
  return `Sale Alert!\nInvoice: ${inv}\nCustomer: ${customer}${itemsSummary}\n\nAmount: ${amount} BDT\nPaid: ${paid} BDT\nDue: ${due} BDT${invoiceLink}`;
}

function buildPaymentReminderMessage(payload: Record<string, unknown>): string {
  const customer = payload.customer_name ?? "Customer";
  const outstanding = payload.outstanding ?? 0;
  const dealerName = payload.dealer_name ?? "";
  const dealerPhone = payload.dealer_phone ?? "";
  const lastPayment = payload.last_payment_date ?? "";

  let msg = `${dealerName ? dealerName + "\n" : ""}`;
  msg += `প্রিয় ${customer},\n`;
  msg += `আপনার বকেয়া পরিমাণ: ${outstanding} BDT।\n`;
  if (lastPayment) msg += `সর্বশেষ পেমেন্ট: ${lastPayment}\n`;
  msg += `অনুগ্রহ করে যত তাড়াতাড়ি সম্ভব পেমেন্ট করুন।\n`;
  if (dealerPhone) msg += `যোগাযোগ: ${dealerPhone}`;
  return msg;
}

function buildDailySummaryMessage(payload: Record<string, unknown>): string {
  const date = payload.date ?? new Date().toISOString().split("T")[0];
  const sales = payload.total_sales ?? 0;
  const revenue = payload.total_revenue ?? 0;
  const profit = payload.total_profit ?? 0;
  return `Daily Summary (${date})\nTotal Sales: ${sales}\nRevenue: ${revenue} BDT\nProfit: ${profit} BDT`;
}

function buildEmailSubjectAndBody(
  type: string,
  payload: Record<string, unknown>,
  recipient: string,
): { subject: string; body: string } {
  if (type === "sale_created") {
    const msg = buildSaleMessage(payload, recipient);
    const inv = payload.invoice_number ?? "N/A";
    return { subject: `Invoice ${inv} - Sale Confirmation`, body: msg };
  }
  if (type === "daily_summary") {
    const date = payload.date ?? new Date().toISOString().split("T")[0];
    return { subject: `Daily Business Summary - ${date}`, body: buildDailySummaryMessage(payload) };
  }
  if (type === "payment_reminder") {
    const customer = payload.customer_name ?? "Customer";
    return { subject: `Payment Reminder - ${customer}`, body: buildPaymentReminderMessage(payload) };
  }
  return { subject: "Notification", body: JSON.stringify(payload) };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body: NotificationRequest = await req.json();
    const { notification_id, dealer_id, channel, type, payload, recipient } = body;

    if (!notification_id || !channel || !type || !recipient) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Check dealer's plan allows this channel ──────────────────────────────
    const { data: subData } = await serviceClient
      .from("subscriptions")
      .select("plan_id, subscription_plans!inner(sms_enabled, email_enabled, daily_summary_enabled)")
      .eq("dealer_id", dealer_id)
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const plan = (subData as any)?.subscription_plans ?? null;
    if (plan) {
      if (channel === "sms" && !plan.sms_enabled) {
        console.log(`[Notification] SMS blocked — plan does not include SMS for dealer ${dealer_id}`);
        await serviceClient.from("notifications").update({ status: "skipped", error_message: "Plan does not include SMS" }).eq("id", notification_id);
        return new Response(JSON.stringify({ success: false, error: "Plan does not include SMS" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (channel === "email" && !plan.email_enabled) {
        console.log(`[Notification] Email blocked — plan does not include Email for dealer ${dealer_id}`);
        await serviceClient.from("notifications").update({ status: "skipped", error_message: "Plan does not include Email" }).eq("id", notification_id);
        return new Response(JSON.stringify({ success: false, error: "Plan does not include Email" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (type === "daily_summary" && !plan.daily_summary_enabled) {
        console.log(`[Notification] Daily summary blocked — plan does not include it for dealer ${dealer_id}`);
        await serviceClient.from("notifications").update({ status: "skipped", error_message: "Plan does not include daily summary" }).eq("id", notification_id);
        return new Response(JSON.stringify({ success: false, error: "Plan does not include daily summary" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log(`[Notification] Processing ${type} via ${channel} → ${recipient}`);

    let success = false;
    let errorMessage: string | undefined;

    if (channel === "sms") {
      let message = "";
      if (type === "sale_created") message = buildSaleMessage(payload, recipient);
      else if (type === "daily_summary") message = buildDailySummaryMessage(payload);
      else if (type === "payment_reminder") message = buildPaymentReminderMessage(payload);
      else message = JSON.stringify(payload);

      const result = await sendSMS(recipient, message);
      success = result.success;
      errorMessage = result.error;
      console.log(`[SMS] Result for ${notification_id}:`, success ? "sent" : errorMessage);

    } else if (channel === "email") {
      const { subject, body: emailBody } = buildEmailSubjectAndBody(type, payload, recipient);
      try {
        await sendSmtpEmail({ from: Deno.env.get("SMTP_FROM") || Deno.env.get("SMTP_USER") || "", to: recipient, subject, body: emailBody });
        success = true;
        console.log(`[Email] Sent to ${recipient} for notification ${notification_id}`);
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[Email] Failed for ${notification_id}:`, errorMessage);
      }
    }

    // Update notification record
    const updateData: Record<string, unknown> = {
      status: success ? "sent" : "failed",
      error_message: errorMessage ?? null,
    };
    if (success) updateData.sent_at = new Date().toISOString();
    else updateData.retry_count = ((payload.retry_count as number) ?? 0) + 1;

    const { error: updateErr } = await serviceClient.from("notifications").update(updateData).eq("id", notification_id);
    if (updateErr) console.error("[Notification] Failed to update status:", updateErr.message);

    return new Response(
      JSON.stringify({ success, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Notification] Unexpected error:", msg);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
