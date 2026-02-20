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
  type: "sale_created" | "daily_summary";
  payload: Record<string, unknown>;
  recipient: string; // phone for sms, email for email
}

async function sendSMS(phone: string, message: string): Promise<{ success: boolean; response?: unknown; error?: string }> {
  const apiKey = Deno.env.get("BULKSMSBD_API_KEY");
  const apiUrl = Deno.env.get("BULKSMSBD_API_URL") ?? "http://bulksmsbd.net/api/smsapi";
  const senderId = Deno.env.get("BULKSMSBD_SENDER_ID");

  if (!apiKey || !senderId) {
    return { success: false, error: "SMS credentials not configured" };
  }

  // Sanitize phone: strip non-digits, ensure BD format
  const cleanPhone = phone.replace(/\D/g, "");

  const params = new URLSearchParams({
    api_key: apiKey,
    type: "text",
    number: cleanPhone,
    senderid: senderId,
    message,
  });

  try {
    const res = await fetch(`${apiUrl}?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const responseText = await res.text();
    console.log("[SMS] BulkSMSBD response:", responseText);

    // BulkSMSBD returns 1701 for success
    if (responseText.includes("1701") || res.ok) {
      return { success: true, response: responseText };
    }

    return { success: false, error: `BulkSMSBD error: ${responseText}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SMS] Fetch error:", msg);
    return { success: false, error: msg };
  }
}

function buildSaleMessage(payload: Record<string, unknown>, recipient: string, ownerPhone: string | undefined): string {
  const inv = payload.invoice_number ?? "N/A";
  const customer = payload.customer_name ?? "Customer";
  const amount = payload.total_amount ?? 0;
  const paid = payload.paid_amount ?? 0;
  const due = payload.due_amount ?? 0;
  const customerPhone = (payload.customer_phone as string | null) ?? null;

  // If this SMS is going to the customer (not the owner), use a customer-friendly message
  if (customerPhone && recipient === customerPhone) {
    return `Dear ${customer},\nThank you for your purchase!\nInvoice: ${inv}\nAmount: ${amount} BDT\nPaid: ${paid} BDT\nDue: ${due} BDT`;
  }
  // Owner alert
  return `Sale Alert!\nInvoice: ${inv}\nCustomer: ${customer}\nAmount: ${amount} BDT\nPaid: ${paid} BDT\nDue: ${due} BDT`;
}

function buildDailySummaryMessage(payload: Record<string, unknown>): string {
  const date = payload.date ?? new Date().toISOString().split("T")[0];
  const sales = payload.total_sales ?? 0;
  const revenue = payload.total_revenue ?? 0;
  const profit = payload.total_profit ?? 0;
  return `Daily Summary (${date})\nTotal Sales: ${sales}\nRevenue: ${revenue} BDT\nProfit: ${profit} BDT`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body: NotificationRequest = await req.json();
    const { notification_id, channel, type, payload, recipient } = body;

    if (!notification_id || !channel || !type || !recipient) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Notification] Processing ${type} via ${channel} → ${recipient}`);

    let success = false;
    let errorMessage: string | undefined;

    if (channel === "sms") {
      // Build message based on type
      let message = "";
      if (type === "sale_created") {
        const ownerPhone = (payload.owner_phone as string | undefined);
        message = buildSaleMessage(payload, recipient, ownerPhone);
      } else if (type === "daily_summary") {
        message = buildDailySummaryMessage(payload);
      } else {
        message = JSON.stringify(payload);
      }

      const result = await sendSMS(recipient, message);
      success = result.success;
      errorMessage = result.error;

      console.log(`[SMS] Result for ${notification_id}:`, success ? "sent" : errorMessage);
    } else {
      // Email: placeholder — extend with Resend/SMTP later
      console.log("[Email] Email channel not yet configured, skipping.");
      errorMessage = "Email channel not configured";
    }

    // Update notification record
    const updateData: Record<string, unknown> = {
      status: success ? "sent" : "failed",
      error_message: errorMessage ?? null,
    };
    if (success) {
      updateData.sent_at = new Date().toISOString();
    } else {
      // Increment retry count on failure
      updateData.retry_count = (payload.retry_count as number ?? 0) + 1;
    }

    const { error: updateErr } = await serviceClient
      .from("notifications")
      .update(updateData)
      .eq("id", notification_id);

    if (updateErr) {
      console.error("[Notification] Failed to update status:", updateErr.message);
    }

    return new Response(
      JSON.stringify({ success, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Notification] Unexpected error:", msg);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
