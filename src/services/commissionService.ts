import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";
import { assertDealerId } from "@/lib/tenancy";

/**
 * Commission / Referral Tracking — Batch 1 service layer.
 *
 * Scope (intentionally simple, dealer-friendly):
 *  - one referral source per sale
 *  - one commission record per sale (UNIQUE constraint enforced in DB)
 *  - commission base = sale.subtotal − sale.discount  (i.e. net invoice value)
 *  - commission becomes "earned" when the sale is fully delivered (Batch 2 polish);
 *    Batch 1 only stores it in `pending` and lets dealer_admin promote/settle later.
 *
 * No stock or ledger side effects in Batch 1 — settlement (which DOES write a
 * cash_ledger expense) is deferred to Batch 2.
 */

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

export const referralSourceService = {
  async list(dealerId: string, opts: { activeOnly?: boolean; search?: string } = {}) {
    await assertDealerId(dealerId);
    let q = (supabase as any)
      .from("referral_sources")
      .select("*")
      .eq("dealer_id", dealerId)
      .order("name", { ascending: true });
    if (opts.activeOnly) q = q.eq("active", true);
    if (opts.search?.trim()) q = q.ilike("name", `%${opts.search.trim()}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as ReferralSource[];
  },

  async getById(id: string) {
    const { data, error } = await (supabase as any)
      .from("referral_sources")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data as ReferralSource;
  },

  async create(input: Omit<ReferralSource, "id" | "created_at" | "updated_at">) {
    await assertDealerId(input.dealer_id);
    const { data, error } = await (supabase as any)
      .from("referral_sources")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit({
      dealer_id: input.dealer_id,
      action: "referral_source_create",
      table_name: "referral_sources",
      record_id: data.id,
      new_data: { name: input.name, source_type: input.source_type },
    });
    return data as ReferralSource;
  },

  async update(id: string, dealerId: string, patch: Partial<ReferralSource>) {
    await assertDealerId(dealerId);
    const { data, error } = await (supabase as any)
      .from("referral_sources")
      .update(patch)
      .eq("id", id)
      .eq("dealer_id", dealerId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit({
      dealer_id: dealerId,
      action: "referral_source_update",
      table_name: "referral_sources",
      record_id: id,
      new_data: patch,
    });
    return data as ReferralSource;
  },

  async toggleActive(id: string, dealerId: string, active: boolean) {
    return this.update(id, dealerId, { active });
  },

  async remove(id: string, dealerId: string) {
    await assertDealerId(dealerId);
    // Soft-delete is preferred since sale_commissions reference this row.
    return this.update(id, dealerId, { active: false });
  },
};

export const saleCommissionService = {
  /** Get the (single) commission attached to a sale, or null. */
  async getForSale(saleId: string) {
    const { data, error } = await (supabase as any)
      .from("sale_commissions")
      .select("*, referral_sources(id, name, source_type, phone)")
      .eq("sale_id", saleId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? null) as SaleCommission | null;
  },

  /** Create or replace the commission for a sale. */
  async upsert(input: UpsertSaleCommissionInput) {
    await assertDealerId(input.dealer_id);
    const calculated = calculateCommissionAmount(
      input.commission_type,
      input.commission_value,
      input.commission_base_amount,
    );

    const existing = await this.getForSale(input.sale_id);

    if (existing) {
      const { data, error } = await (supabase as any)
        .from("sale_commissions")
        .update({
          referral_source_id: input.referral_source_id,
          commission_type: input.commission_type,
          commission_value: input.commission_value,
          commission_base_amount: input.commission_base_amount,
          calculated_commission_amount: calculated,
          notes: input.notes ?? null,
        })
        .eq("id", existing.id)
        .eq("dealer_id", input.dealer_id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await logAudit({
        dealer_id: input.dealer_id,
        action: "sale_commission_update",
        table_name: "sale_commissions",
        record_id: existing.id,
        new_data: { ...input, calculated_commission_amount: calculated },
      });
      return data as SaleCommission;
    }

    const { data, error } = await (supabase as any)
      .from("sale_commissions")
      .insert({
        dealer_id: input.dealer_id,
        sale_id: input.sale_id,
        referral_source_id: input.referral_source_id,
        commission_type: input.commission_type,
        commission_value: input.commission_value,
        commission_base_amount: input.commission_base_amount,
        calculated_commission_amount: calculated,
        status: "pending",
        notes: input.notes ?? null,
        created_by: input.created_by ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit({
      dealer_id: input.dealer_id,
      action: "sale_commission_create",
      table_name: "sale_commissions",
      record_id: data.id,
      new_data: { ...input, calculated_commission_amount: calculated },
    });
    return data as SaleCommission;
  },

  /** Remove a commission from a sale (used when user clears referral on edit). */
  async removeForSale(saleId: string, dealerId: string) {
    await assertDealerId(dealerId);
    const { error } = await (supabase as any)
      .from("sale_commissions")
      .delete()
      .eq("sale_id", saleId)
      .eq("dealer_id", dealerId);
    if (error) throw new Error(error.message);
    await logAudit({
      dealer_id: dealerId,
      action: "sale_commission_remove",
      table_name: "sale_commissions",
      record_id: saleId,
    });
  },

  /**
   * List commissions for a dealer with optional filters.
   * Joins sale + customer + referral source for the reports table.
   */
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
    await assertDealerId(dealerId);
    let q = (supabase as any)
      .from("sale_commissions")
      .select(
        "*, referral_sources(id, name, source_type, phone), sales(id, invoice_number, sale_date, sale_status, customers(id, name))",
      )
      .eq("dealer_id", dealerId)
      .order("created_at", { ascending: false });
    if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
    if (opts.referralSourceId) q = q.eq("referral_source_id", opts.referralSourceId);
    if (opts.from) q = q.gte("created_at", opts.from);
    if (opts.to) q = q.lte("created_at", opts.to);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    let rows = (data ?? []) as any[];
    if (opts.sourceType) {
      rows = rows.filter((r) => r.referral_sources?.source_type === opts.sourceType);
    }
    return rows as (SaleCommission & {
      sales?: {
        id: string;
        invoice_number: string | null;
        sale_date: string;
        sale_status: string;
        customers?: { id: string; name: string } | null;
      } | null;
    })[];
  },

  /**
   * BUSINESS RULE: a commission becomes "earned" only when the sale is fully delivered.
   * Called from deliveryService.updateSaleDeliveryStatus once the sale flips to `delivered`.
   * Idempotent — only promotes a row that is currently `pending`.
   */
  async promoteToEarnedIfFullyDelivered(saleId: string, dealerId: string) {
    await assertDealerId(dealerId);
    const existing = await this.getForSale(saleId);
    if (!existing) return;
    if (existing.status !== "pending") return;

    const { data, error } = await (supabase as any)
      .from("sale_commissions")
      .update({
        status: "earned",
        payable_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("dealer_id", dealerId)
      .eq("status", "pending") // race-safe guard
      .select("*")
      .single();
    if (error) {
      // Not fatal — delivery flow must continue even if commission promotion fails.
      console.warn("Commission earn-promotion skipped:", error.message);
      return;
    }
    await logAudit({
      dealer_id: dealerId,
      action: "sale_commission_earned",
      table_name: "sale_commissions",
      record_id: existing.id,
      new_data: { sale_id: saleId, amount: existing.calculated_commission_amount },
    });
    return data as SaleCommission;
  },

  /**
   * Owner/admin records a commission payout.
   * Writes a single cash_ledger expense row (financial + audit trail) and
   * flips the commission to `settled`.
   *
   * Batch 2 keeps it simple: single full settlement (no partial). The
   * settled_amount column lets us extend later without a migration.
   */
  async settle(input: {
    commission_id: string;
    dealer_id: string;
    settled_amount: number;
    settled_at?: string;
    settled_by?: string | null;
    note?: string | null;
  }) {
    await assertDealerId(input.dealer_id);
    const { data: existing, error: fetchErr } = await (supabase as any)
      .from("sale_commissions")
      .select("*, referral_sources(name, source_type), sales(invoice_number)")
      .eq("id", input.commission_id)
      .eq("dealer_id", input.dealer_id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) throw new Error("Commission not found.");
    if (existing.status === "settled") throw new Error("Commission already settled.");
    if (existing.status === "cancelled") throw new Error("Cancelled commissions cannot be settled.");
    if (existing.status === "pending") {
      throw new Error(
        "Commission is still pending — sale must be fully delivered before payout.",
      );
    }

    const amount = Math.max(0, Math.round(Number(input.settled_amount) * 100) / 100);
    if (amount <= 0) throw new Error("Settlement amount must be greater than zero.");

    const settledAt = input.settled_at ?? new Date().toISOString();
    const entryDate = settledAt.slice(0, 10);

    // 1) Cash ledger expense entry — the financial trail.
    const refName = existing.referral_sources?.name ?? "Referrer";
    const invoiceNo = existing.sales?.invoice_number ?? "—";
    const { error: cashErr } = await supabase.from("cash_ledger").insert({
      dealer_id: input.dealer_id,
      type: "expense" as any,
      amount,
      description: `Commission payout to ${refName} for invoice ${invoiceNo}${
        input.note ? ` — ${input.note}` : ""
      }`,
      reference_type: "sale_commission",
      reference_id: input.commission_id,
      entry_date: entryDate,
    });
    if (cashErr) throw new Error(`Failed to record cash entry: ${cashErr.message}`);

    // 2) Flip the commission row.
    const { data: updated, error: updErr } = await (supabase as any)
      .from("sale_commissions")
      .update({
        status: "settled",
        settled_at: settledAt,
        settled_amount: amount,
        notes: input.note
          ? `${existing.notes ? existing.notes + "\n" : ""}Settled: ${input.note}`
          : existing.notes,
      })
      .eq("id", input.commission_id)
      .eq("dealer_id", input.dealer_id)
      .select("*")
      .single();
    if (updErr) {
      // Best-effort rollback of the cash entry to avoid orphaned expense.
      await supabase
        .from("cash_ledger")
        .delete()
        .eq("reference_id", input.commission_id)
        .eq("reference_type", "sale_commission")
        .eq("entry_date", entryDate);
      throw new Error(updErr.message);
    }

    // 3) Audit trail.
    await logAudit({
      dealer_id: input.dealer_id,
      user_id: input.settled_by ?? null,
      action: "sale_commission_settle",
      table_name: "sale_commissions",
      record_id: input.commission_id,
      old_data: { status: existing.status, settled_amount: existing.settled_amount },
      new_data: { status: "settled", settled_amount: amount, settled_at: settledAt },
    });

    return updated as SaleCommission;
  },

  /** Owner/admin can cancel a still-unsettled commission (e.g. sale was cancelled). */
  async cancel(commissionId: string, dealerId: string, reason?: string) {
    await assertDealerId(dealerId);
    const existing = await (supabase as any)
      .from("sale_commissions")
      .select("status, notes")
      .eq("id", commissionId)
      .eq("dealer_id", dealerId)
      .single();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data.status === "settled") {
      throw new Error("Cannot cancel an already-settled commission.");
    }
    const { error } = await (supabase as any)
      .from("sale_commissions")
      .update({
        status: "cancelled",
        notes: reason
          ? `${existing.data.notes ? existing.data.notes + "\n" : ""}Cancelled: ${reason}`
          : existing.data.notes,
      })
      .eq("id", commissionId)
      .eq("dealer_id", dealerId);
    if (error) throw new Error(error.message);
    await logAudit({
      dealer_id: dealerId,
      action: "sale_commission_cancel",
      table_name: "sale_commissions",
      record_id: commissionId,
      new_data: { reason: reason ?? null },
    });
  },

  /**
   * Dashboard aggregate stats — unpaid liability, payable now (earned),
   * settled this month, and top referral source by unsettled liability.
   */
  async getDashboardStats(dealerId: string) {
    await assertDealerId(dealerId);
    const { data, error } = await (supabase as any)
      .from("sale_commissions")
      .select(
        "status, calculated_commission_amount, settled_amount, settled_at, referral_source_id, referral_sources(name, source_type)",
      )
      .eq("dealer_id", dealerId);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{
      status: CommissionStatus;
      calculated_commission_amount: number;
      settled_amount: number;
      settled_at: string | null;
      referral_source_id: string;
      referral_sources?: { name: string; source_type: ReferralSourceType } | null;
    }>;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    let unpaidLiability = 0; // pending + earned (NOT yet settled)
    let payableNow = 0; // earned only
    let pendingDelivery = 0; // pending only
    let settledThisMonth = 0;
    const liabilityBySource = new Map<
      string,
      { name: string; source_type: ReferralSourceType; amount: number }
    >();

    for (const r of rows) {
      const calc = Number(r.calculated_commission_amount) || 0;
      const settled = Number(r.settled_amount) || 0;
      if (r.status === "pending") {
        pendingDelivery += calc;
        unpaidLiability += calc;
      } else if (r.status === "earned") {
        payableNow += calc;
        unpaidLiability += calc;
      } else if (r.status === "settled" && r.settled_at) {
        if (new Date(r.settled_at) >= monthStart) settledThisMonth += settled;
      }
      if ((r.status === "pending" || r.status === "earned") && r.referral_sources) {
        const cur = liabilityBySource.get(r.referral_source_id) ?? {
          name: r.referral_sources.name,
          source_type: r.referral_sources.source_type,
          amount: 0,
        };
        cur.amount += calc;
        liabilityBySource.set(r.referral_source_id, cur);
      }
    }

    const topSource = [...liabilityBySource.values()].sort((a, b) => b.amount - a.amount)[0] ?? null;

    return {
      unpaidLiability: Math.round(unpaidLiability * 100) / 100,
      payableNow: Math.round(payableNow * 100) / 100,
      pendingDelivery: Math.round(pendingDelivery * 100) / 100,
      settledThisMonth: Math.round(settledThisMonth * 100) / 100,
      topSource,
      totalReferralSources: liabilityBySource.size,
    };
  },
};
