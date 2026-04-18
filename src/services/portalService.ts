import { supabase } from "@/integrations/supabase/client";

export type PortalRole = "contractor" | "architect" | "project_customer";
export type PortalStatus = "invited" | "active" | "inactive" | "revoked";

export interface PortalUser {
  id: string;
  dealer_id: string;
  customer_id: string;
  auth_user_id: string | null;
  email: string;
  name: string;
  phone: string | null;
  portal_role: PortalRole;
  status: PortalStatus;
  invited_at: string;
  activated_at: string | null;
  last_login_at: string | null;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalContext {
  dealer_id: string;
  customer_id: string;
  portal_user_id: string;
}

export interface OutstandingSummary {
  outstanding: number;
  total_billed: number;
  total_paid: number;
  last_payment_date: string | null;
  last_payment_amount: number | null;
}

export interface RecentPayment {
  entry_date: string;
  amount: number;
  description: string | null;
  sale_id: string | null;
}

// ---------- Admin (dealer_admin) operations ----------

export async function listPortalUsers(dealerId: string): Promise<PortalUser[]> {
  const { data, error } = await supabase
    .from("portal_users")
    .select("*")
    .eq("dealer_id", dealerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PortalUser[];
}

export async function invitePortalUser(payload: {
  customer_id: string;
  email: string;
  name: string;
  phone?: string;
  portal_role?: PortalRole;
  send_magic_link?: boolean;
}) {
  const { data, error } = await supabase.functions.invoke("invite-portal-user", {
    body: payload,
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) {
    throw new Error((data as { error: string }).error);
  }
  return data as {
    success: boolean;
    portal_user: PortalUser;
    magic_link: string | null;
  };
}

export async function setPortalUserStatus(id: string, status: PortalStatus) {
  const { error } = await supabase
    .from("portal_users")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

// ---------- Portal-side (logged-in portal user) ----------

export async function getPortalContext(): Promise<PortalContext | null> {
  const { data, error } = await supabase.rpc("get_portal_context");
  if (error) {
    console.warn("get_portal_context error:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.customer_id) return null;
  return row as PortalContext;
}

export async function bindAuthUser() {
  const { error } = await supabase.rpc("portal_bind_auth_user");
  if (error) console.warn("portal_bind_auth_user error:", error.message);
}

export async function touchLastLogin() {
  const { error } = await supabase.rpc("portal_touch_last_login");
  if (error) console.warn("portal_touch_last_login error:", error.message);
}

export async function getOutstandingSummary(): Promise<OutstandingSummary | null> {
  const { data, error } = await supabase.rpc("get_portal_outstanding_summary");
  if (error) {
    console.warn("outstanding summary error:", error.message);
    return null;
  }
  const obj = data as { error?: string } & OutstandingSummary;
  if (obj?.error) return null;
  return obj as OutstandingSummary;
}

export async function getRecentPayments(limit = 10): Promise<RecentPayment[]> {
  const { data, error } = await supabase.rpc("get_portal_recent_payments", {
    _limit: limit,
  });
  if (error) {
    console.warn("recent payments error:", error.message);
    return [];
  }
  return (data ?? []) as RecentPayment[];
}

// ---------- Portal data fetchers (RLS-scoped) ----------

export async function listPortalQuotations(customerId: string) {
  const { data, error } = await supabase
    .from("quotations")
    .select(
      "id, quotation_no, revision_no, quote_date, valid_until, status, total_amount"
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listPortalSales(customerId: string) {
  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, invoice_no, sale_date, status, total_amount, paid_amount, balance_due"
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listPortalDeliveries(customerId: string) {
  // Two paths: deliveries linked via sale → filter by sale's customer_id
  const { data: sales } = await supabase
    .from("sales")
    .select("id, invoice_no")
    .eq("customer_id", customerId);
  const saleIds = (sales ?? []).map((s) => s.id);
  if (saleIds.length === 0) return [];

  const { data, error } = await supabase
    .from("deliveries")
    .select(
      "id, delivery_no, delivery_date, status, sale_id, receiver_name, delivery_address, notes"
    )
    .in("sale_id", saleIds)
    .order("delivery_date", { ascending: false });
  if (error) throw error;
  const byId = new Map((sales ?? []).map((s) => [s.id, s.invoice_no]));
  return (data ?? []).map((d) => ({
    ...d,
    invoice_no: byId.get(d.sale_id ?? "") ?? null,
  }));
}

export async function listPortalProjects(customerId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, project_code, project_name, status, start_date, expected_end_date")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listPortalSites(customerId: string) {
  const { data, error } = await supabase
    .from("project_sites")
    .select("id, site_name, address, status, project_id")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
