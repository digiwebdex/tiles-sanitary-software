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

export async function logAudit(input: AuditLogInput) {
  const { error } = await supabase.from("audit_logs").insert([{
    dealer_id: input.dealer_id,
    user_id: input.user_id || null,
    action: input.action,
    table_name: input.table_name,
    record_id: input.record_id,
    old_data: (input.old_data as any) ?? null,
    new_data: (input.new_data as any) ?? null,
  }]);
  if (error) console.error("Audit log failed:", error.message);
}
