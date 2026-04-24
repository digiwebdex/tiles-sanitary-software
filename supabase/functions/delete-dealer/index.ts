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
    // ── Auth: caller must be super_admin ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerUserId = claimsData.claims.sub;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleCheck } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden: super_admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse body ──
    const { dealer_id, confirm_name } = await req.json();
    if (!dealer_id || typeof dealer_id !== "string") {
      return new Response(JSON.stringify({ error: "dealer_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify dealer exists & confirm name matches ──
    const { data: dealer, error: dealerErr } = await serviceClient
      .from("dealers")
      .select("id, name")
      .eq("id", dealer_id)
      .maybeSingle();

    if (dealerErr) throw new Error(dealerErr.message);
    if (!dealer) {
      return new Response(JSON.stringify({ error: "Dealer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!confirm_name || confirm_name.trim() !== dealer.name.trim()) {
      return new Response(JSON.stringify({ error: "Confirmation name does not match dealer name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Collect all auth.users tied to this dealer ──
    const { data: dealerProfiles } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("dealer_id", dealer_id);

    const { data: portalUsers } = await serviceClient
      .from("portal_users")
      .select("auth_user_id")
      .eq("dealer_id", dealer_id);

    const authUserIds = new Set<string>();
    (dealerProfiles ?? []).forEach((p: any) => p.id && authUserIds.add(p.id));
    (portalUsers ?? []).forEach((p: any) => p.auth_user_id && authUserIds.add(p.auth_user_id));

    // ── Cascade delete all dealer-scoped data ──
    // Order matters: delete leaf/child tables first, then parents.
    const childTables = [
      // approvals & audit
      "approval_requests",
      "approval_settings",
      "audit_logs",
      // backorder
      "backorder_allocations",
      "purchase_shortage_links",
      // delivery chain
      "delivery_item_batches",
      "delivery_items",
      "deliveries",
      // challans
      "challans",
      // sales chain
      "sale_commissions" as any,
      "sale_item_batches" as any,
      "sale_items" as any,
      "sales_return_items",
      "sales_returns",
      "sales",
      // purchases chain
      "purchase_return_items",
      "purchase_returns",
      "purchase_items",
      "purchases",
      // quotations
      "quotation_items" as any,
      "quotations",
      // ledgers
      "customer_ledger",
      "cash_ledger",
      "expense_ledger",
      "expenses",
      // inventory
      "product_batches",
      "display_movements",
      "display_stock",
      "price_tier_items",
      "price_tiers",
      "products",
      // campaigns / followups / collections
      "campaign_gifts",
      "customer_followups",
      // projects
      "project_sites",
      "projects",
      "project_code_sequences",
      // portal
      "portal_requests",
      "portal_users",
      // customers / suppliers
      "customers",
      "suppliers" as any,
      // settings & sequences
      "demand_planning_settings",
      "notification_settings",
      "notifications",
      "invoice_sequences",
      "credit_overrides",
      // subscriptions
      "subscription_payments" as any,
      "subscriptions" as any,
    ];

    const errors: string[] = [];
    for (const table of childTables) {
      const { error } = await serviceClient.from(table as any).delete().eq("dealer_id", dealer_id);
      // Ignore "relation does not exist" errors (table may not exist in this schema)
      if (error && !/does not exist|schema cache/i.test(error.message)) {
        errors.push(`${table}: ${error.message}`);
      }
    }

    // Delete user_roles for all dealer auth users
    if (authUserIds.size > 0) {
      const ids = Array.from(authUserIds);
      const { error: rolesErr } = await serviceClient.from("user_roles").delete().in("user_id", ids);
      if (rolesErr) errors.push(`user_roles: ${rolesErr.message}`);

      const { error: profErr } = await serviceClient.from("profiles").delete().in("id", ids);
      if (profErr) errors.push(`profiles: ${profErr.message}`);
    }

    // Finally delete the dealer
    const { error: dealerDeleteErr } = await serviceClient.from("dealers").delete().eq("id", dealer_id);
    if (dealerDeleteErr) {
      return new Response(
        JSON.stringify({
          error: "Failed to delete dealer: " + dealerDeleteErr.message,
          partial_errors: errors,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete auth.users (best-effort)
    const authDeleteErrors: string[] = [];
    for (const uid of authUserIds) {
      const { error } = await serviceClient.auth.admin.deleteUser(uid);
      if (error) authDeleteErrors.push(`${uid}: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted_dealer: dealer.name,
        deleted_auth_users: authUserIds.size,
        non_critical_errors: [...errors, ...authDeleteErrors],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
