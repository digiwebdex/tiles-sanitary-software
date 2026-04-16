import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";

// ── Types ──────────────────────────────────────────────────────────────
export type ApprovalType =
  | "backorder_sale"
  | "mixed_shade"
  | "mixed_caliber"
  | "credit_override"
  | "overdue_override"
  | "discount_override"
  | "stock_adjustment"
  | "sale_cancel"
  | "reservation_release";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "auto_approved"
  | "consumed"
  | "stale";

export interface ApprovalRequest {
  id: string;
  dealer_id: string;
  approval_type: ApprovalType;
  status: ApprovalStatus;
  action_hash: string;
  context_data: Record<string, any>;
  reason: string | null;
  source_type: string;
  source_id: string | null;
  requested_by: string;
  decided_by: string | null;
  decision_note: string | null;
  decided_at: string | null;
  consumed_by: string | null;
  consumed_at: string | null;
  consumed_source_id: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ApprovalContextData {
  customer_id?: string;
  customer_name?: string;
  items?: Array<{
    product_id: string;
    product_name?: string;
    quantity: number;
    sale_rate?: number;
  }>;
  shortage_qty?: number;
  discount_pct?: number;
  overdue_amount?: number;
  overdue_days?: number;
  credit_limit?: number;
  outstanding?: number;
  batch_ids?: string[];
  reservation_ids?: string[];
  mixed_shades?: string[];
  mixed_calibers?: string[];
  [key: string]: any;
}

export interface ApprovalSettings {
  dealer_id: string;
  require_backorder_approval: boolean;
  require_mixed_shade_approval: boolean;
  require_mixed_caliber_approval: boolean;
  require_credit_override_approval: boolean;
  require_overdue_override_approval: boolean;
  require_stock_adjustment_approval: boolean;
  require_sale_cancel_approval: boolean;
  discount_approval_threshold: number;
  auto_approve_for_admins: boolean;
}

// ── Canonical Hash ─────────────────────────────────────────────────────
/**
 * Generate deterministic SHA-256 hash from approval context.
 * Rules:
 *  - Keys sorted alphabetically at every level
 *  - Items array sorted by product_id
 *  - Null/undefined values omitted
 *  - Numbers serialized without trailing zeros
 */
function sortAndClean(obj: any): any {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj === "number") return obj;
  if (typeof obj === "string") return obj;
  if (typeof obj === "boolean") return obj;

  if (Array.isArray(obj)) {
    const cleaned = obj.map(sortAndClean).filter((v) => v !== undefined);
    // Sort arrays of objects by product_id if present
    if (cleaned.length > 0 && typeof cleaned[0] === "object" && cleaned[0]?.product_id) {
      cleaned.sort((a: any, b: any) => (a.product_id ?? "").localeCompare(b.product_id ?? ""));
    }
    return cleaned;
  }

  if (typeof obj === "object") {
    const sorted: Record<string, any> = {};
    for (const key of Object.keys(obj).sort()) {
      const val = sortAndClean(obj[key]);
      if (val !== undefined) {
        sorted[key] = val;
      }
    }
    return sorted;
  }

  return obj;
}

export async function generateActionHash(
  approvalType: ApprovalType,
  context: ApprovalContextData
): Promise<string> {
  const canonical = sortAndClean({ approval_type: approvalType, ...context });
  const json = JSON.stringify(canonical);
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Settings ───────────────────────────────────────────────────────────
export async function getApprovalSettings(dealerId: string): Promise<ApprovalSettings> {
  const { data, error } = await supabase
    .from("approval_settings")
    .select("*")
    .eq("dealer_id", dealerId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  // Return defaults if no settings row exists
  if (!data) {
    return {
      dealer_id: dealerId,
      require_backorder_approval: true,
      require_mixed_shade_approval: true,
      require_mixed_caliber_approval: true,
      require_credit_override_approval: true,
      require_overdue_override_approval: true,
      require_stock_adjustment_approval: false,
      require_sale_cancel_approval: true,
      discount_approval_threshold: 10,
      auto_approve_for_admins: true,
    };
  }

  return data as unknown as ApprovalSettings;
}

/**
 * Check if a specific approval type is required for this dealer.
 */
export function isApprovalRequired(
  settings: ApprovalSettings,
  type: ApprovalType,
  extra?: { discount_pct?: number }
): boolean {
  switch (type) {
    case "backorder_sale":
      return settings.require_backorder_approval;
    case "mixed_shade":
      return settings.require_mixed_shade_approval;
    case "mixed_caliber":
      return settings.require_mixed_caliber_approval;
    case "credit_override":
      return settings.require_credit_override_approval;
    case "overdue_override":
      return settings.require_overdue_override_approval;
    case "stock_adjustment":
      return settings.require_stock_adjustment_approval;
    case "sale_cancel":
      return settings.require_sale_cancel_approval;
    case "discount_override":
      return (extra?.discount_pct ?? 0) >= settings.discount_approval_threshold;
    case "reservation_release":
      return false; // handled by role check
    default:
      return false;
  }
}

// ── CRUD ───────────────────────────────────────────────────────────────
export async function createApprovalRequest(params: {
  dealerId: string;
  approvalType: ApprovalType;
  sourceType: string;
  sourceId?: string;
  requestedBy: string;
  reason?: string;
  context: ApprovalContextData;
  isAdmin?: boolean;
  autoApproveForAdmins?: boolean;
}): Promise<ApprovalRequest> {
  const actionHash = await generateActionHash(params.approvalType, params.context);

  // Auto-approve for admins if setting enabled
  const shouldAutoApprove = params.isAdmin && (params.autoApproveForAdmins ?? true);
  const status = shouldAutoApprove ? "auto_approved" : "pending";

  const row = {
    dealer_id: params.dealerId,
    approval_type: params.approvalType,
    status,
    action_hash: actionHash,
    context_data: params.context,
    reason: params.reason || null,
    source_type: params.sourceType,
    source_id: params.sourceId || null,
    requested_by: params.requestedBy,
    decided_by: shouldAutoApprove ? params.requestedBy : null,
    decided_at: shouldAutoApprove ? new Date().toISOString() : null,
    consumed_at: shouldAutoApprove ? new Date().toISOString() : null,
    consumed_by: shouldAutoApprove ? params.requestedBy : null,
  };

  const { data, error } = await supabase
    .from("approval_requests")
    .insert(row as any)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Audit
  await logAudit({
    dealer_id: params.dealerId,
    action: shouldAutoApprove ? "APPROVAL_AUTO_APPROVED" : "APPROVAL_REQUESTED",
    table_name: "approval_requests",
    record_id: data!.id,
    new_data: {
      approval_type: params.approvalType,
      source_type: params.sourceType,
      status,
    },
  });

  return data as unknown as ApprovalRequest;
}

/**
 * Decide on a pending approval (approve/reject). Uses atomic RPC.
 */
export async function decideApprovalRequest(
  requestId: string,
  decision: "approved" | "rejected",
  decisionNote?: string
): Promise<void> {
  const { error } = await supabase.rpc("decide_approval_request", {
    _request_id: requestId,
    _decision: decision,
    _decision_note: decisionNote || null,
  });

  if (error) throw new Error(error.message);
}

/**
 * Consume an approved request. Validates hash match + binds source_id.
 */
export async function consumeApprovalRequest(
  requestId: string,
  actionHash: string,
  sourceId?: string
): Promise<void> {
  const { error } = await supabase.rpc("consume_approval_request", {
    _request_id: requestId,
    _action_hash: actionHash,
    _source_id: sourceId || null,
  });

  if (error) throw new Error(error.message);
}

/**
 * Find a valid (approved, not consumed, not expired) approval for a given hash.
 */
export async function findValidApproval(
  dealerId: string,
  approvalType: ApprovalType,
  context: ApprovalContextData
): Promise<ApprovalRequest | null> {
  const actionHash = await generateActionHash(approvalType, context);

  const { data, error } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("dealer_id", dealerId)
    .eq("approval_type", approvalType)
    .eq("action_hash", actionHash)
    .in("status", ["approved", "auto_approved"])
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  // Check expiry client-side too
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null;
  }

  return data as unknown as ApprovalRequest;
}

/**
 * List pending approvals for a dealer (for dashboard/management).
 */
export async function listPendingApprovals(dealerId: string): Promise<ApprovalRequest[]> {
  const { data, error } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("dealer_id", dealerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ApprovalRequest[];
}

/**
 * List all approvals with optional filters.
 */
export async function listApprovals(
  dealerId: string,
  filters?: { status?: string; type?: string }
): Promise<ApprovalRequest[]> {
  let query = supabase
    .from("approval_requests")
    .select("*")
    .eq("dealer_id", dealerId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.type) {
    query = query.eq("approval_type", filters.type as ApprovalType);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ApprovalRequest[];
}

// ── Status Labels ──────────────────────────────────────────────────────
export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
  auto_approved: "Auto-Approved",
  consumed: "Used",
  stale: "Stale",
};

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  backorder_sale: "Backorder Sale",
  mixed_shade: "Mixed Shade",
  mixed_caliber: "Mixed Caliber",
  credit_override: "Credit Limit Override",
  overdue_override: "Overdue Override",
  discount_override: "Discount Override",
  stock_adjustment: "Stock Adjustment",
  sale_cancel: "Sale Cancel",
  reservation_release: "Reservation Release",
};
