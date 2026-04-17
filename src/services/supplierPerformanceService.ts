import { supabase } from "@/integrations/supabase/client";

/**
 * Supplier Performance Tracking — Batch 1
 *
 * Purely DERIVED from existing tables:
 *   - purchases             → frequency, recency, spend
 *   - purchase_returns      → return rate (reliability signal)
 *   - supplier_ledger       → outstanding exposure
 *
 * No schema changes. No side effects. Read-only analytics.
 *
 * Lead-time note:
 *   The ERP does not capture a separate "order placed" date,
 *   so we approximate "supply cadence" as the average gap between
 *   consecutive purchases from the same supplier. This is a practical
 *   reliability signal for tiles/sanitary dealers (regular suppliers
 *   should have a consistent cadence).
 *
 * Score (0-100), explainable:
 *   start at 100, then:
 *     - subtract 2 points per 1% return rate (capped at 40)
 *     - subtract 10 points if no purchase in last 90 days
 *     - subtract 10 points if outstanding > 5x avg purchase value
 *   floor at 0.
 */

export type ReliabilityBand = "reliable" | "average" | "at_risk" | "inactive";

export interface SupplierPerformance {
  supplier_id: string;
  supplier_name: string;
  status: string;

  total_purchases: number;
  total_purchase_value: number;
  avg_purchase_value: number;
  last_purchase_date: string | null;
  days_since_last_purchase: number | null;

  // cadence proxy for "lead time"
  avg_days_between_purchases: number | null;

  // reliability
  total_returns: number;
  total_return_value: number;
  return_rate_pct: number; // 0-100

  // exposure
  outstanding_amount: number;

  // derived
  reliability_score: number; // 0-100
  reliability_band: ReliabilityBand;
}

interface ListOptions {
  startDate?: string;
  endDate?: string;
}

function classify(score: number, lastPurchaseDate: string | null): ReliabilityBand {
  if (!lastPurchaseDate) return "inactive";
  const daysSince = Math.floor((Date.now() - new Date(lastPurchaseDate).getTime()) / 86_400_000);
  if (daysSince > 180) return "inactive";
  if (score >= 80) return "reliable";
  if (score >= 60) return "average";
  return "at_risk";
}

function computeScore(args: {
  returnRatePct: number;
  daysSinceLast: number | null;
  outstanding: number;
  avgPurchaseValue: number;
}): number {
  let score = 100;
  score -= Math.min(40, args.returnRatePct * 2);
  if (args.daysSinceLast !== null && args.daysSinceLast > 90) score -= 10;
  if (args.avgPurchaseValue > 0 && args.outstanding > args.avgPurchaseValue * 5) score -= 10;
  return Math.max(0, Math.round(score));
}

export const supplierPerformanceService = {
  /**
   * Returns performance metrics for every supplier of the dealer.
   */
  async list(dealerId: string, opts: ListOptions = {}): Promise<SupplierPerformance[]> {
    const [supRes, purRes, retRes, ledRes] = await Promise.all([
      supabase
        .from("suppliers")
        .select("id, name, status")
        .eq("dealer_id", dealerId),
      (() => {
        let q = supabase
          .from("purchases")
          .select("id, supplier_id, purchase_date, total_amount")
          .eq("dealer_id", dealerId);
        if (opts.startDate) q = q.gte("purchase_date", opts.startDate);
        if (opts.endDate) q = q.lte("purchase_date", opts.endDate);
        return q;
      })(),
      (() => {
        let q = supabase
          .from("purchase_returns")
          .select("id, supplier_id, return_date, total_amount, status")
          .eq("dealer_id", dealerId);
        if (opts.startDate) q = q.gte("return_date", opts.startDate);
        if (opts.endDate) q = q.lte("return_date", opts.endDate);
        return q;
      })(),
      supabase
        .from("supplier_ledger")
        .select("supplier_id, amount, type")
        .eq("dealer_id", dealerId),
    ]);

    if (supRes.error) throw new Error(supRes.error.message);
    if (purRes.error) throw new Error(purRes.error.message);
    if (retRes.error) throw new Error(retRes.error.message);
    if (ledRes.error) throw new Error(ledRes.error.message);

    const suppliers = supRes.data ?? [];
    const purchases = purRes.data ?? [];
    const returns = (retRes.data ?? []).filter((r) => r.status !== "cancelled");
    const ledger = ledRes.data ?? [];

    // Index by supplier
    const purBySup = new Map<string, { date: string; amount: number }[]>();
    for (const p of purchases) {
      if (!p.supplier_id) continue;
      const arr = purBySup.get(p.supplier_id) ?? [];
      arr.push({ date: p.purchase_date, amount: Number(p.total_amount) });
      purBySup.set(p.supplier_id, arr);
    }

    const retBySup = new Map<string, { count: number; total: number }>();
    for (const r of returns) {
      if (!r.supplier_id) continue;
      const cur = retBySup.get(r.supplier_id) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(r.total_amount ?? 0);
      retBySup.set(r.supplier_id, cur);
    }

    // Outstanding = sum(purchases / opening) - sum(payments / returns)
    // We treat ledger.type honestly: "purchase" / "opening" increases payable;
    // "payment" / "return" decreases payable. Unknown types ignored.
    const outBySup = new Map<string, number>();
    for (const e of ledger) {
      if (!e.supplier_id) continue;
      const amt = Number(e.amount);
      const cur = outBySup.get(e.supplier_id) ?? 0;
      const t = (e.type ?? "").toLowerCase();
      if (t === "purchase" || t === "opening" || t === "adjustment") {
        outBySup.set(e.supplier_id, cur + amt);
      } else if (t === "payment" || t === "return" || t === "refund") {
        outBySup.set(e.supplier_id, cur - amt);
      } else {
        outBySup.set(e.supplier_id, cur);
      }
    }

    const today = Date.now();

    return suppliers.map<SupplierPerformance>((s) => {
      const pList = (purBySup.get(s.id) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
      const totalPurchases = pList.length;
      const totalPurchaseValue = pList.reduce((sum, p) => sum + p.amount, 0);
      const avgPurchaseValue = totalPurchases > 0 ? totalPurchaseValue / totalPurchases : 0;
      const lastPurchase = pList.length > 0 ? pList[pList.length - 1].date : null;
      const daysSinceLast = lastPurchase
        ? Math.floor((today - new Date(lastPurchase).getTime()) / 86_400_000)
        : null;

      let avgGap: number | null = null;
      if (pList.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < pList.length; i++) {
          const d = (new Date(pList[i].date).getTime() - new Date(pList[i - 1].date).getTime()) / 86_400_000;
          if (d >= 0) gaps.push(d);
        }
        if (gaps.length > 0) {
          avgGap = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
        }
      }

      const retInfo = retBySup.get(s.id) ?? { count: 0, total: 0 };
      const returnRatePct =
        totalPurchaseValue > 0
          ? Math.round((retInfo.total / totalPurchaseValue) * 10_000) / 100
          : 0;

      const outstanding = Math.max(0, Math.round((outBySup.get(s.id) ?? 0) * 100) / 100);

      const score = computeScore({
        returnRatePct,
        daysSinceLast,
        outstanding,
        avgPurchaseValue,
      });

      return {
        supplier_id: s.id,
        supplier_name: s.name,
        status: s.status,
        total_purchases: totalPurchases,
        total_purchase_value: Math.round(totalPurchaseValue * 100) / 100,
        avg_purchase_value: Math.round(avgPurchaseValue * 100) / 100,
        last_purchase_date: lastPurchase,
        days_since_last_purchase: daysSinceLast,
        avg_days_between_purchases: avgGap,
        total_returns: retInfo.count,
        total_return_value: Math.round(retInfo.total * 100) / 100,
        return_rate_pct: returnRatePct,
        outstanding_amount: outstanding,
        reliability_score: score,
        reliability_band: classify(score, lastPurchase),
      };
    });
  },

  /**
   * Performance for a single supplier (used in supplier detail page).
   */
  async getForSupplier(dealerId: string, supplierId: string): Promise<SupplierPerformance | null> {
    const all = await this.list(dealerId);
    return all.find((s) => s.supplier_id === supplierId) ?? null;
  },

  /**
   * Compact dashboard rollup — top reliable, at-risk, high-outstanding.
   */
  async getDashboardStats(dealerId: string) {
    const all = await this.list(dealerId);
    const active = all.filter((s) => s.total_purchases > 0);

    const topReliable = active
      .filter((s) => s.reliability_band === "reliable")
      .sort((a, b) => b.reliability_score - a.reliability_score || b.total_purchase_value - a.total_purchase_value)
      .slice(0, 5);

    const atRisk = active
      .filter((s) => s.reliability_band === "at_risk")
      .sort((a, b) => a.reliability_score - b.reliability_score)
      .slice(0, 5);

    const highOutstanding = active
      .filter((s) => s.outstanding_amount > 0)
      .sort((a, b) => b.outstanding_amount - a.outstanding_amount)
      .slice(0, 5);

    const delayedCount = active.filter(
      (s) => s.days_since_last_purchase !== null && s.days_since_last_purchase > 90,
    ).length;

    return {
      totalSuppliers: all.length,
      activeSuppliers: active.length,
      reliableCount: active.filter((s) => s.reliability_band === "reliable").length,
      atRiskCount: atRisk.length,
      delayedCount,
      totalOutstanding:
        Math.round(active.reduce((sum, s) => sum + s.outstanding_amount, 0) * 100) / 100,
      topReliable,
      atRisk,
      highOutstanding,
    };
  },
};
