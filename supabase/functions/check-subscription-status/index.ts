import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const graceCutoff = new Date(now);
    graceCutoff.setDate(graceCutoff.getDate() - 3);
    const todayStr = now.toISOString().split("T")[0];
    const graceCutoffStr = graceCutoff.toISOString().split("T")[0];

    // 1. Active subs past end_date but within 3-day grace → keep active (handled by app logic)
    //    No DB status change needed for grace — the app computes grace from end_date.

    // 2. Active subs whose end_date + 3 days < today → set to expired
    const { data: expiredSubs, error: expErr } = await supabase
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("status", "active")
      .not("end_date", "is", null)
      .lt("end_date", graceCutoffStr)
      .select("id, dealer_id");

    if (expErr) {
      console.error("Error expiring subscriptions:", expErr.message);
    }

    const expiredCount = expiredSubs?.length ?? 0;

    // 3. Optional: check for single dealer_id mode — update specific dealer
    let singleDealerUpdated = false;
    const body = await req.json().catch(() => null);
    if (body?.dealer_id) {
      const { data: dealerSub } = await supabase
        .from("subscriptions")
        .select("id, status, end_date")
        .eq("dealer_id", body.dealer_id)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dealerSub && dealerSub.status === "active" && dealerSub.end_date) {
        const endDate = new Date(dealerSub.end_date);
        const graceEnd = new Date(endDate);
        graceEnd.setDate(graceEnd.getDate() + 3);

        if (now > graceEnd) {
          await supabase
            .from("subscriptions")
            .update({ status: "expired" })
            .eq("id", dealerSub.id);
          singleDealerUpdated = true;
        }
      }
    }

    // 4. Log the batch run
    await supabase.from("audit_logs").insert({
      action: "SUBSCRIPTION_STATUS_CHECK",
      table_name: "subscriptions",
      new_data: {
        expired_count: expiredCount,
        checked_at: now.toISOString(),
        single_dealer: body?.dealer_id ?? null,
        single_dealer_updated: singleDealerUpdated,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        expired_count: expiredCount,
        single_dealer_updated: singleDealerUpdated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Subscription check error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
