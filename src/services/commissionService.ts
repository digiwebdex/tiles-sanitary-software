/**
 * Commission Service — VPS-backed (Phase 3U-13).
 *
 * All reads/writes go through /api/commissions/*. Business rules and audit
 * are enforced server-side (see backend/src/routes/commissions.ts).
 *
 * Public surface is unchanged so existing consumers (SaleForm, SaleCommissionPanel,
 * deliveryService, CommissionReports, ReferralSourcesPage, dashboard widgets)
 * keep working.
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export type ReferralSourceType =
  | "salesman"
  | "architect"
  | "contractor"
  | "mason"
  | "fitter"
  | "other";

export type CommissionType = "percent" | "fixed";

export type CommissionStatus =
  | "pending"
  | "earned"
  | "settled"
  | "cancelled"
  | "adjusted";

export interface ReferralSource {
  id: string;
  dealer_id: string;
  source_type: ReferralSourceType;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
  default_commission_type: CommissionType | null;
  default_commission_value: number | null;
  created_at: string;
  updated_at: string;
}

export interface SaleCommission {
  id: string;
  dealer_id: string;
  sale_id: string;
  referral_source_id: string;
  commission_type: CommissionType;
  commission_value: number;
  commission_base_amount: number;
  calculated_commission_amount: number;
  status: CommissionStatus;
  payable_at: string | null;
  settled_at: string | null;
  settled_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  referral_sources?: Pick<ReferralSource, "id" | "name" | "source_type" | "phone"> | null;
}

export interface UpsertSaleCommissionInput {
  dealer_id: string;
  sale_id: string;
  referral_source_id: string;
  commission_type: CommissionType;
  commission_value: number;
  /** Base amount snapshot — usually subtotal − discount of the sale at save time. */
  commission_base_amount: number;
  notes?: string | null;
  created_by?: string | null;
}

/** Pure helper — used in UI preview AND in service writes so they stay in sync. */
export function calculateCommissionAmount(
  type: CommissionType,
  value: number,
  baseAmount: number,
): number {
  const v = Number(value) || 0;
  const base = Math.max(0, Number(baseAmount) || 0);
  if (type === "percent") {
    const pct = Math.min(Math.max(v, 0), 100);
    return Math.round((base * pct) / 100 * 100) / 100;
  }
  return Math.max(0, Math.round(v * 100) / 100);
}

async function vpsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  if (res.status === 204) return undefined as unknown as T;
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

function qs(params: Record<string, string | boolean | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const referralSourceService = {
  async list(dealerId: string, opts: { activeOnly?: boolean; search?: string } = {}) {
    const body = await vpsJson<{ rows: ReferralSource[] }>(
      `/api/commissions/sources${qs({ dealerId, activeOnly: opts.activeOnly, search: opts.search?.trim() || undefined })}`,
    );
    return body.rows ?? [];
  },

  async getById(id: string) {
    // Backend requires dealerId; resolve from current user via authedFetch (req.dealerId).
    const body = await vpsJson<{ row: ReferralSource }>(`/api/commissions/sources/${id}`);
    return body.row;
  },

  async create(input: Omit<ReferralSource, "id" | "created_at" | "updated_at">) {
    const body = await vpsJson<{ row: ReferralSource }>(`/api/commissions/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealerId: input.dealer_id,
        source_type: input.source_type,
        name: input.name,
        phone: input.phone,
        notes: input.notes,
        active: input.active,
        default_commission_type: input.default_commission_type,
        default_commission_value: input.default_commission_value,
      }),
    });
    return body.row;
  },

  async update(id: string, dealerId: string, patch: Partial<ReferralSource>) {
    const { dealer_id: _d, id: _id, created_at: _c, updated_at: _u, ...rest } = patch as any;
    const body = await vpsJson<{ row: ReferralSource }>(`/api/commissions/sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId, ...rest }),
    });
    return body.row;
  },

  async toggleActive(id: string, dealerId: string, active: boolean) {
    return this.update(id, dealerId, { active });
  },

  async remove(id: string, dealerId: string) {
    const body = await vpsJson<{ row: ReferralSource }>(
      `/api/commissions/sources/${id}${qs({ dealerId })}`,
      { method: "DELETE" },
    );
    return body.row;
  },
};

export const saleCommissionService = {
  async getForSale(saleId: string) {
    const body = await vpsJson<{ row: SaleCommission | null }>(
      `/api/commissions/sale/${saleId}`,
    );
    return body.row;
  },

  async upsert(input: UpsertSaleCommissionInput) {
    const body = await vpsJson<{ row: SaleCommission }>(
      `/api/commissions/sale/${input.sale_id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealerId: input.dealer_id,
          referral_source_id: input.referral_source_id,
          commission_type: input.commission_type,
          commission_value: input.commission_value,
          commission_base_amount: input.commission_base_amount,
          notes: input.notes ?? null,
          created_by: input.created_by ?? null,
        }),
      },
    );
    return body.row;
  },

  async removeForSale(saleId: string, dealerId: string) {
    await vpsJson<{ ok: true }>(
      `/api/commissions/sale/${saleId}${qs({ dealerId })}`,
      { method: "DELETE" },
    );
  },

  async list(
    dealerId: string,
    opts: {
      status?: CommissionStatus | "all";
      referralSourceId?: string;
      sourceType?: ReferralSourceType;
      from?: string;
      to?: string;
    } = {},
  ) {
    const body = await vpsJson<{
      rows: (SaleCommission & {
        sales?: {
          id: string;
          invoice_number: string | null;
          sale_date: string;
          sale_status: string;
          customers?: { id: string; name: string } | null;
        } | null;
      })[];
    }>(
      `/api/commissions${qs({
        dealerId,
        status: opts.status,
        referralSourceId: opts.referralSourceId,
        sourceType: opts.sourceType,
        from: opts.from,
        to: opts.to,
      })}`,
    );
    return body.rows ?? [];
  },

  async promoteToEarnedIfFullyDelivered(saleId: string, dealerId: string) {
    const existing = await this.getForSale(saleId);
    if (!existing) return;
    if (existing.status !== "pending") return;
    try {
      const body = await vpsJson<{ row: SaleCommission | null; skipped?: string }>(
        `/api/commissions/${existing.id}/promote-earned`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealerId, saleId }),
        },
      );
      return body.row ?? undefined;
    } catch (e: any) {
      // Not fatal — delivery flow must continue even if commission promotion fails.
      console.warn("Commission earn-promotion skipped:", e.message);
      return;
    }
  },

  async settle(input: {
    commission_id: string;
    dealer_id: string;
    settled_amount: number;
    settled_at?: string;
    settled_by?: string | null;
    note?: string | null;
  }) {
    const body = await vpsJson<{ row: SaleCommission }>(
      `/api/commissions/${input.commission_id}/settle`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealerId: input.dealer_id,
          settled_amount: input.settled_amount,
          settled_at: input.settled_at,
          note: input.note ?? null,
        }),
      },
    );
    return body.row;
  },

  async cancel(commissionId: string, dealerId: string, reason?: string) {
    await vpsJson<{ ok: true }>(`/api/commissions/${commissionId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId, reason: reason ?? null }),
    });
  },

  async getDashboardStats(dealerId: string) {
    return await vpsJson<{
      unpaidLiability: number;
      payableNow: number;
      pendingDelivery: number;
      settledThisMonth: number;
      topSource: { name: string; source_type: ReferralSourceType; amount: number } | null;
      totalReferralSources: number;
    }>(`/api/commissions/dashboard-stats${qs({ dealerId })}`);
  },
};
