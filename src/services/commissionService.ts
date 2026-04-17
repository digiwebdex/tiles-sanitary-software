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
};
