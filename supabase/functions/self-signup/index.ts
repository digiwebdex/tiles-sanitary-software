import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Helper to create notification record and invoke send-notification
async function sendNotification(
  client: any,
  opts: { dealer_id: string; channel: "sms" | "email"; type: string; recipient: string; message: string; subject?: string }
) {
  const { data: notif } = await client.from("notifications").insert({
    dealer_id: opts.dealer_id,
    channel: opts.channel,
    type: opts.type,
    status: "pending",
    payload: { _custom_message: opts.message, ...(opts.subject ? { _subject: opts.subject } : {}) },
  }).select("id").single();

  if (!notif) return;

  try {
    await client.functions.invoke("send-notification", {
      body: {
        notification_id: notif.id,
        dealer_id: opts.dealer_id,
        channel: opts.channel,
        type: opts.type,
        payload: { _custom_message: opts.message },
        recipient: opts.recipient,
      },
    });
  } catch (err) {
    console.error(`[sendNotification] Failed ${opts.channel} to ${opts.recipient}:`, err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { name, business_name, phone, email, password } = body;

    // ── Validate inputs ──
    if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid name" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!business_name || typeof business_name !== "string" || business_name.trim().length === 0 || business_name.length > 150) {
      return new Response(JSON.stringify({ error: "Invalid business name" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!phone || typeof phone !== "string" || phone.trim().length < 6 || phone.length > 20) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email) || email.length > 255) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!password || typeof password !== "string" || password.length < 6 || password.length > 72) {
      return new Response(JSON.stringify({ error: "Password must be 6-72 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Check if email already exists ──
    const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
    const emailLower = email.trim().toLowerCase();
    const alreadyExists = existingUsers?.users?.some(
      (u: any) => u.email?.toLowerCase() === emailLower
    );
    if (alreadyExists) {
      return new Response(JSON.stringify({ error: "An account with this email already exists. Please sign in." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 1. Create dealer (PENDING — requires super admin approval) ──
    const { data: dealer, error: dealerErr } = await serviceClient
      .from("dealers")
      .insert({
        name: business_name.trim(),
        phone: phone.trim(),
        status: "pending",
      })
      .select("id")
      .single();

    if (dealerErr || !dealer) {
      console.error("Dealer creation error:", dealerErr);
      return new Response(JSON.stringify({ error: "Failed to create dealer" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Create auth user ──
    const { data: newUser, error: createErr } = await serviceClient.auth.admin.createUser({
      email: emailLower,
      password,
      email_confirm: true,
      user_metadata: { name: name.trim() },
    });

    if (createErr || !newUser?.user) {
      // Rollback dealer
      await serviceClient.from("dealers").delete().eq("id", dealer.id);
      console.error("User creation error:", createErr);
      return new Response(JSON.stringify({ error: createErr?.message || "Failed to create user" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    // ── 3. Update profile with dealer_id ──
    const { error: profileErr } = await serviceClient
      .from("profiles")
      .update({ dealer_id: dealer.id, name: name.trim() })
      .eq("id", userId);

    if (profileErr) {
      console.error("Profile update error:", profileErr);
      await serviceClient.auth.admin.deleteUser(userId);
      await serviceClient.from("dealers").delete().eq("id", dealer.id);
      return new Response(JSON.stringify({ error: "Failed to provision user profile" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Assign dealer_admin role ──
    const { error: roleErr } = await serviceClient
      .from("user_roles")
      .insert({ user_id: userId, role: "dealer_admin" });

    if (roleErr) {
      console.error("Role insert error:", roleErr);
      await serviceClient.auth.admin.deleteUser(userId);
      await serviceClient.from("dealers").delete().eq("id", dealer.id);
      return new Response(JSON.stringify({ error: "Failed to assign account role" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Create invoice sequence ──
    await serviceClient
      .from("invoice_sequences")
      .insert({ dealer_id: dealer.id });

    // ── 6. Get Starter plan and create trial subscription (3 days) ──
    const { data: plan } = await serviceClient
      .from("subscription_plans")
      .select("id")
      .eq("name", "Starter")
      .eq("is_active", true)
      .single();

    if (plan) {
      const startDate = new Date().toISOString().split("T")[0];
      const endDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const { error: subscriptionErr } = await serviceClient.from("subscriptions").insert({
        dealer_id: dealer.id,
        plan_id: plan.id,
        status: "active",
        billing_cycle: "monthly",
        start_date: startDate,
        end_date: endDate,
      });

      if (subscriptionErr) {
        console.error("Subscription creation error:", subscriptionErr);
        await serviceClient.auth.admin.deleteUser(userId);
        await serviceClient.from("dealers").delete().eq("id", dealer.id);
        return new Response(JSON.stringify({ error: "Failed to create trial subscription" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.error("Starter plan not found during self-signup");
      await serviceClient.auth.admin.deleteUser(userId);
      await serviceClient.from("dealers").delete().eq("id", dealer.id);
      return new Response(JSON.stringify({ error: "Starter plan is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 6b. Create default notification settings ──
    await serviceClient.from("notification_settings").insert({
      dealer_id: dealer.id,
      enable_sale_sms: true,
      enable_sale_email: true,
      enable_daily_summary_sms: true,
      enable_daily_summary_email: true,
      owner_email: emailLower,
      owner_phone: phone.trim(),
    });

    // ── 7. Log as contact submission for SA tracking ──
    await serviceClient.from("contact_submissions").insert({
      name: name.trim(),
      business_name: business_name.trim(),
      phone: phone.trim(),
      email: emailLower,
      message: `Auto-signup: ${business_name.trim()}`,
      status: "auto_provisioned",
    });

    // ── 8. Send notifications to dealer and super admin ──
    try {
      const dealerSmsMsg = `স্বাগতম ${name.trim()}!\nআপনার "${business_name.trim()}" ব্যবসার অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে।\n3 দিনের ফ্রি ট্রায়াল শুরু হয়েছে।\nলগইন: ${emailLower}\n\nTiles & Sanitary ERP`;
      const dealerEmailSubject = `Welcome to Tiles & Sanitary ERP - Account Created`;
      const dealerEmailBody = `Dear ${name.trim()},\n\nYour business account "${business_name.trim()}" has been successfully created!\n\nAccount Details:\n- Business: ${business_name.trim()}\n- Email: ${emailLower}\n- Phone: ${phone.trim()}\n- Plan: Starter (3-day free trial)\n\nYou can now log in and start managing your business.\n\nBest regards,\nTiles & Sanitary ERP Team`;

      // Get super admin info
      const { data: saRoles } = await serviceClient
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin");

      // Hardcoded admin contact (per project owner)
      const DEFAULT_ADMIN_EMAIL = "digiwebdex@gmail.com";
      const DEFAULT_ADMIN_PHONE = "+8801674533303";

      let adminEmail: string | null = DEFAULT_ADMIN_EMAIL;
      if (saRoles && saRoles.length > 0) {
        const { data: saProfile } = await serviceClient
          .from("profiles")
          .select("email")
          .eq("id", saRoles[0].user_id)
          .single();
        if (saProfile?.email) adminEmail = saProfile.email;
      }
      // Env override takes highest priority
      const envAdminEmail = Deno.env.get("ADMIN_EMAIL");
      if (envAdminEmail) adminEmail = envAdminEmail;

      const adminSmsMsg = `নতুন ডিলার রেজিস্ট্রেশন!\nনাম: ${name.trim()}\nব্যবসা: ${business_name.trim()}\nফোন: ${phone.trim()}\nইমেইল: ${emailLower}\nPlan: Starter (Trial)`;
      const adminEmailSubject = `New Dealer Registration - ${business_name.trim()}`;
      const adminEmailBody = `New Dealer Account Created!\n\nDealer Details:\n- Owner: ${name.trim()}\n- Business: ${business_name.trim()}\n- Phone: ${phone.trim()}\n- Email: ${emailLower}\n- Plan: Starter (3-day trial)\n- Date: ${new Date().toISOString().split("T")[0]}\n\nPlease review in the Super Admin panel.`;

      // Send SMS to dealer
      if (phone.trim()) {
        await sendNotification(serviceClient, {
          dealer_id: dealer.id,
          channel: "sms",
          type: "new_signup",
          recipient: phone.trim(),
          message: dealerSmsMsg,
        });
      }

      // Send Email to dealer
      await sendNotification(serviceClient, {
        dealer_id: dealer.id,
        channel: "email",
        type: "new_signup",
        recipient: emailLower,
        subject: dealerEmailSubject,
        message: dealerEmailBody,
      });

      // Send SMS to admin (env override > hardcoded default)
      const adminPhone = Deno.env.get("ADMIN_PHONE") || DEFAULT_ADMIN_PHONE;
      if (adminPhone) {
        await sendNotification(serviceClient, {
          dealer_id: dealer.id,
          channel: "sms",
          type: "new_signup",
          recipient: adminPhone,
          message: adminSmsMsg,
        });
      }

      // Send Email to admin
      if (adminEmail) {
        await sendNotification(serviceClient, {
          dealer_id: dealer.id,
          channel: "email",
          type: "new_signup",
          recipient: adminEmail,
          subject: adminEmailSubject,
          message: adminEmailBody,
        });
      }

      console.log("[Self-signup] Notifications sent successfully");
    } catch (notifErr) {
      console.error("[Self-signup] Notification error (non-blocking):", notifErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        pending_approval: true,
        user_id: userId,
        dealer_id: dealer.id,
        message: "Account created. Awaiting Super Admin approval before you can log in.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Self-signup error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
