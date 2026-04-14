import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // ── 1. Create dealer ──
    const { data: dealer, error: dealerErr } = await serviceClient
      .from("dealers")
      .insert({
        name: business_name.trim(),
        phone: phone.trim(),
        status: "active",
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

    if (profileErr) console.error("Profile update error:", profileErr);

    // ── 4. Assign dealer_admin role ──
    const { error: roleErr } = await serviceClient
      .from("user_roles")
      .insert({ user_id: userId, role: "dealer_admin" });

    if (roleErr) console.error("Role insert error:", roleErr);

    // ── 5. Create invoice sequence ──
    await serviceClient
      .from("invoice_sequences")
      .insert({ dealer_id: dealer.id });

    // ── 6. Get Basic plan and create trial subscription (30 days) ──
    const { data: plan } = await serviceClient
      .from("subscription_plans")
      .select("id")
      .eq("name", "Basic")
      .eq("is_active", true)
      .single();

    if (plan) {
      const startDate = new Date().toISOString().split("T")[0];
      const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      await serviceClient.from("subscriptions").insert({
        dealer_id: dealer.id,
        plan_id: plan.id,
        status: "active",
        billing_cycle: "monthly",
        start_date: startDate,
        end_date: endDate,
      });
    }

    // ── 7. Log as contact submission for SA tracking ──
    await serviceClient.from("contact_submissions").insert({
      name: name.trim(),
      business_name: business_name.trim(),
      phone: phone.trim(),
      email: emailLower,
      message: `Auto-signup: ${business_name.trim()}`,
      status: "auto_provisioned",
    });

    return new Response(
      JSON.stringify({ success: true, user_id: userId, dealer_id: dealer.id }),
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
