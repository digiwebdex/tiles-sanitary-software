import { supabase } from "@/integrations/supabase/client";

interface AuditLogInput {
  dealer_id: string;
  user_id?: string | null;
  action: string;
  table_name: string;
  record_id: string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
}

/**
 * Logs an audit entry with user context, IP, and user agent.
 * Audit logs are INSERT-only for regular users — no one except
 * super_admin can read, update, or delete them.
 */
export async function logAudit(input: AuditLogInput) {
  // Resolve user_id from session if not provided
  let userId = input.user_id ?? null;
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  const { error } = await supabase.from("audit_logs").insert([{
    dealer_id: input.dealer_id,
    user_id: userId,
    action: input.action,
    table_name: input.table_name,
    record_id: input.record_id,
    old_data: (input.old_data as any) ?? null,
    new_data: (input.new_data as any) ?? null,
    ip_address: null, // Resolved server-side via RLS/triggers if needed
    user_agent: navigator?.userAgent ?? null,
  }]);
  if (error) console.error("Audit log failed:", error.message);
}
