import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user is a super admin
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check super admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: Super Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list-backups";

    switch (action) {
      case "list-backups": {
        const { data, error } = await supabase
          .from("backup_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);

        if (error) throw error;
        return new Response(JSON.stringify({ backups: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list-restores": {
        const { data, error } = await supabase
          .from("restore_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) throw error;
        return new Response(JSON.stringify({ restores: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "backup-stats": {
        const { data: backups } = await supabase
          .from("backup_logs")
          .select("status, backup_type, created_at, file_size")
          .order("created_at", { ascending: false })
          .limit(500);

        const stats = {
          total: backups?.length || 0,
          successful: backups?.filter((b) => b.status === "uploaded").length || 0,
          failed: backups?.filter((b) => b.status === "failed").length || 0,
          totalSize: backups?.reduce((sum, b) => sum + (b.file_size || 0), 0) || 0,
          lastBackup: backups?.[0]?.created_at || null,
          byType: {
            postgresql: backups?.filter((b) => b.backup_type === "postgresql").length || 0,
            mysql: backups?.filter((b) => b.backup_type === "mysql").length || 0,
            mongodb: backups?.filter((b) => b.backup_type === "mongodb").length || 0,
          },
        };

        return new Response(JSON.stringify({ stats }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "log-restore": {
        const body = await req.json();
        const { data, error } = await supabase.from("restore_logs").insert({
          backup_file_name: body.backup_file_name,
          backup_type: body.backup_type,
          database_name: body.database_name,
          app_name: body.app_name || "unknown",
          initiated_by: user.id,
          initiated_by_name: user.email || "unknown",
          status: body.status || "pending",
          pre_restore_backup_taken: body.pre_restore_backup_taken || false,
          error_message: body.error_message,
          logs: body.logs,
        }).select().single();

        if (error) throw error;
        return new Response(JSON.stringify({ restore: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
