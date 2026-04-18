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

export interface LedgerHistoryRow {
  entry_date: string;
  entry_type: string;
  amount: number;
  description: string | null;
  reference_no: string | null;
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
  const obj = data as unknown as { error?: string } & OutstandingSummary;
  if (obj?.error) return null;
  return obj;
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

export async function getLedgerHistory(limit = 30): Promise<LedgerHistoryRow[]> {
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(
    "get_portal_ledger_history",
    { _limit: limit },
  );
  if (error) {
    console.warn("ledger history error:", error.message);
    return [];
  }
  return (data as LedgerHistoryRow[] | null) ?? [];
}

// ---------- Project detail (Batch 2) ----------

export interface PortalProjectSummary {
  project: {
    id: string;
    project_code: string;
    project_name: string;
    status: string;
    start_date: string | null;
    expected_end_date: string | null;
    notes: string | null;
  };
  sites: Array<{
    id: string;
    site_name: string;
    address: string | null;
    status: string;
  }>;
  quotations: Array<{
    id: string;
    quotation_no: string;
    revision_no: number;
    quote_date: string;
    status: string;
    total_amount: number;
  }>;
  sales: Array<{
    id: string;
    invoice_number: string | null;
    sale_date: string;
    sale_status: string;
    total_amount: number;
    paid_amount: number;
    due_amount: number;
  }>;
  deliveries: Array<{
    id: string;
    delivery_no: string | null;
    delivery_date: string;
    status: string | null;
    sale_id: string | null;
    invoice_number: string | null;
  }>;
  items: Array<{
    product_id: string;
    product_name: string;
    product_sku: string;
    unit_type: string;
    ordered_qty: number;
    delivered_qty: number;
    pending_qty: number;
  }>;
}

export async function getPortalProjectSummary(
  projectId: string,
): Promise<PortalProjectSummary | { error: string } | null> {
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(
    "get_portal_project_summary",
    { _project_id: projectId },
  );
  if (error) {
    console.warn("project summary error:", error.message);
    return null;
  }
  const obj = data as PortalProjectSummary | { error: string } | null;
  return obj;
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

export interface PortalSale {
  id: string;
  invoice_number: string | null;
  sale_date: string;
  sale_status: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
}

export async function listPortalSales(customerId: string): Promise<PortalSale[]> {
  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, invoice_number, sale_date, sale_status, total_amount, paid_amount, due_amount"
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PortalSale[];
}

export interface PortalDelivery {
  id: string;
  delivery_no: string | null;
  delivery_date: string;
  status: string | null;
  sale_id: string | null;
  receiver_name: string | null;
  delivery_address: string | null;
  notes: string | null;
  invoice_number: string | null;
}

export async function listPortalDeliveries(customerId: string): Promise<PortalDelivery[]> {
  const { data: sales } = await supabase
    .from("sales")
    .select("id, invoice_number")
    .eq("customer_id", customerId);
  const saleRows = (sales ?? []) as { id: string; invoice_number: string | null }[];
  const saleIds = saleRows.map((s) => s.id);
  if (saleIds.length === 0) return [];

  const { data, error } = await supabase
    .from("deliveries")
    .select(
      "id, delivery_no, delivery_date, status, sale_id, receiver_name, delivery_address, notes"
    )
    .in("sale_id", saleIds)
    .order("delivery_date", { ascending: false });
  if (error) throw error;
  const byId = new Map(saleRows.map((s) => [s.id, s.invoice_number]));
  return (data ?? []).map((d) => ({
    ...d,
    invoice_number: byId.get(d.sale_id ?? "") ?? null,
  })) as PortalDelivery[];
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

// ---------- Batch 3: Requests ----------

export type PortalRequestType = "reorder" | "quote";
export type PortalRequestStatus = "pending" | "reviewed" | "converted" | "closed";

export interface PortalRequestItem {
  product_id?: string | null;
  product_name: string;
  product_sku?: string | null;
  unit_type?: string | null;
  quantity: number;
  rate?: number | null;
  notes?: string | null;
}

export interface PortalRequest {
  id: string;
  dealer_id: string;
  customer_id: string;
  portal_user_id: string | null;
  request_type: PortalRequestType;
  status: PortalRequestStatus;
  source_sale_id: string | null;
  source_quotation_id: string | null;
  project_id: string | null;
  site_id: string | null;
  message: string | null;
  items: PortalRequestItem[];
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  converted_quotation_id: string | null;
  created_at: string;
  updated_at: string;
}

const rpc = supabase.rpc as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function submitPortalRequest(payload: {
  request_type: PortalRequestType;
  source_sale_id?: string | null;
  source_quotation_id?: string | null;
  project_id?: string | null;
  site_id?: string | null;
  message?: string | null;
  items: PortalRequestItem[];
}): Promise<string> {
  const { data, error } = await rpc("submit_portal_request", {
    _request_type: payload.request_type,
    _source_sale_id: payload.source_sale_id ?? null,
    _source_quotation_id: payload.source_quotation_id ?? null,
    _project_id: payload.project_id ?? null,
    _site_id: payload.site_id ?? null,
    _message: payload.message ?? null,
    _items: payload.items,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listMyPortalRequests(): Promise<PortalRequest[]> {
  const { data, error } = await supabase
    .from("portal_requests" as never)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as PortalRequest[]).map((r) => ({
    ...r,
    items: Array.isArray(r.items) ? r.items : [],
  }));
}

export async function getPortalSaleItems(saleId: string): Promise<PortalRequestItem[]> {
  const { data, error } = await rpc("get_portal_sale_items", { _sale_id: saleId });
  if (error) throw new Error(error.message);
  return ((data as PortalRequestItem[] | null) ?? []).map((r) => ({
    ...r,
    quantity: Number(r.quantity ?? 0),
    rate: r.rate != null ? Number(r.rate) : null,
  }));
}

// ---------- Batch 3: Documents ----------

export interface PortalQuotationDoc {
  quotation: Record<string, unknown>;
  items: Record<string, unknown>[];
  dealer: Record<string, unknown>;
  customer: Record<string, unknown>;
}

export async function getPortalQuotationDoc(quotationId: string): Promise<PortalQuotationDoc | null> {
  const { data, error } = await rpc("get_portal_quotation_doc", { _quotation_id: quotationId });
  if (error) {
    console.warn("portal quotation doc:", error.message);
    return null;
  }
  return data as PortalQuotationDoc;
}

export interface PortalInvoiceDoc {
  sale: Record<string, unknown>;
  items: Record<string, unknown>[];
  dealer: Record<string, unknown>;
  customer: Record<string, unknown>;
}

export async function getPortalInvoiceDoc(saleId: string): Promise<PortalInvoiceDoc | null> {
  const { data, error } = await rpc("get_portal_invoice_doc", { _sale_id: saleId });
  if (error) {
    console.warn("portal invoice doc:", error.message);
    return null;
  }
  return data as PortalInvoiceDoc;
}

export interface PortalChallanDoc {
  challan: Record<string, unknown>;
  sale: Record<string, unknown>;
  items: Record<string, unknown>[];
  dealer: Record<string, unknown>;
  customer: Record<string, unknown>;
}

export async function getPortalChallanDoc(challanId: string): Promise<PortalChallanDoc | null> {
  const { data, error } = await rpc("get_portal_challan_doc", { _challan_id: challanId });
  if (error) {
    console.warn("portal challan doc:", error.message);
    return null;
  }
  return data as PortalChallanDoc;
}

// ---------- Batch 3: WhatsApp tie-in ----------

export interface PortalWhatsAppStatus {
  message_type: string;
  status: string;
  sent_at: string | null;
  created_at: string;
}

export async function getPortalWhatsAppStatus(
  sourceType: "quotation" | "sale" | "delivery",
  sourceId: string,
): Promise<PortalWhatsAppStatus | null> {
  const { data, error } = await rpc("get_portal_whatsapp_status", {
    _source_type: sourceType,
    _source_id: sourceId,
  });
  if (error) {
    console.warn("portal wa status:", error.message);
    return null;
  }
  return (data as PortalWhatsAppStatus | null) ?? null;
}

// ---------- Batch 3: Admin (dealer-side requests) ----------

export async function listDealerPortalRequests(dealerId: string): Promise<PortalRequest[]> {
  const { data, error } = await supabase
    .from("portal_requests" as never)
    .select("*")
    .eq("dealer_id", dealerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as PortalRequest[]).map((r) => ({
    ...r,
    items: Array.isArray(r.items) ? r.items : [],
  }));
}

export async function updatePortalRequest(
  id: string,
  patch: {
    status?: PortalRequestStatus;
    review_note?: string | null;
    reviewed_by?: string | null;
    converted_quotation_id?: string | null;
  },
): Promise<void> {
  const update: Record<string, unknown> = { ...patch };
  if (patch.status && patch.status !== "pending") {
    update.reviewed_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from("portal_requests" as never)
    .update(update as never)
    .eq("id", id);
  if (error) throw error;
}
