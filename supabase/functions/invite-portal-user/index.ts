import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitePayload {
  customer_id: string;
  email: string;
  name: string;
  phone?: string;
  portal_role?: "contractor" | "architect" | "project_customer";
  send_magic_link?: boolean; // default true
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Authed client (acts as the caller — used for permission checks via RLS)
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    // Admin client — used to create auth users / send magic link
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Invalid session" }, 401);
    }
    const callerId = userData.user.id;

    // Verify caller is dealer_admin or super_admin
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isSuper = roles?.some((r) => r.role === "super_admin");
    const isDealerAdmin = roles?.some((r) => r.role === "dealer_admin");
    if (!isSuper && !isDealerAdmin) {
      return json({ error: "Insufficient permissions" }, 403);
    }

    const body = (await req.json()) as InvitePayload;
    if (!body?.customer_id || !body?.email || !body?.name) {
      return json({ error: "customer_id, email, and name are required" }, 400);
    }

    const email = body.email.trim().toLowerCase();
    const sendMagicLink = body.send_magic_link !== false;

    // Resolve dealer_id from the customer (and verify caller's scope if not super)
    const { data: customer, error: custErr } = await admin
      .from("customers")
      .select("id, dealer_id, name")
      .eq("id", body.customer_id)
      .maybeSingle();
    if (custErr || !customer) {
      return json({ error: "Customer not found" }, 404);
    }

    if (!isSuper) {
      const { data: profile } = await admin
        .from("profiles")
        .select("dealer_id")
        .eq("id", callerId)
        .maybeSingle();
      if (!profile?.dealer_id || profile.dealer_id !== customer.dealer_id) {
        return json({ error: "Customer not in your dealer scope" }, 403);
      }
    }

    // Check if portal_users row already exists for this dealer+email
    const { data: existing } = await admin
      .from("portal_users")
      .select("id, status, auth_user_id")
      .eq("dealer_id", customer.dealer_id)
      .eq("email", email)
      .maybeSingle();
    if (existing && existing.status !== "revoked") {
      return json(
        { error: "A portal user with this email already exists for this dealer" },
        409
      );
    }

    // Create or fetch auth user
    let authUserId: string | null = null;
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existingAuth = list?.users?.find(
      (u) => u.email?.toLowerCase() === email
    );
    if (existingAuth) {
      authUserId = existingAuth.id;
    } else {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { name: body.name, portal: true },
        });
      if (createErr) return json({ error: createErr.message }, 400);
      authUserId = created.user?.id ?? null;
    }

    // Insert / re-activate portal_users row
    let portalRow;
    if (existing) {
      const { data: upd, error: updErr } = await admin
        .from("portal_users")
        .update({
          name: body.name,
          phone: body.phone ?? null,
          portal_role: body.portal_role ?? "contractor",
          customer_id: body.customer_id,
          auth_user_id: authUserId,
          status: "invited",
          invited_at: new Date().toISOString(),
          invited_by: callerId,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (updErr) return json({ error: updErr.message }, 400);
      portalRow = upd;
    } else {
      const { data: ins, error: insErr } = await admin
        .from("portal_users")
        .insert({
          dealer_id: customer.dealer_id,
          customer_id: body.customer_id,
          email,
          name: body.name,
          phone: body.phone ?? null,
          portal_role: body.portal_role ?? "contractor",
          auth_user_id: authUserId,
          status: "invited",
          invited_by: callerId,
        })
        .select("*")
        .single();
      if (insErr) return json({ error: insErr.message }, 400);
      portalRow = ins;
    }

    // Magic-link invite
    let magic_link: string | null = null;
    if (sendMagicLink) {
      const origin = req.headers.get("origin") ?? "";
      const redirectTo = `${origin}/portal/dashboard`;
      const { data: linkData, error: linkErr } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo },
        });
      if (linkErr) {
        console.warn("Magic link generation failed:", linkErr.message);
      } else {
        magic_link = linkData?.properties?.action_link ?? null;
      }
    }

    return json({
      success: true,
      portal_user: portalRow,
      magic_link, // surfaced so dealer_admin can copy/share
    });
  } catch (e) {
    console.error("invite-portal-user error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
