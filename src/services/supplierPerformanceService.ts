import { supabase } from "@/integrations/supabase/client";
import { env } from "@/lib/env";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

const USE_VPS = env.AUTH_BACKEND === "vps";

async function vpsGet<T>(path: string): Promise<T> {
  const res = await vpsAuthedFetch(path);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((body as any)?.error || `Request failed (${res.status})`);
  return body as T;
}

/**
 * Supplier Performance Tracking — Batch 1 + Batch 2 + Batch 3
 *
 * Purely DERIVED from existing tables:
 *   - purchases             → frequency, recency, spend, cadence
 *   - purchase_items        → unit price trend (Batch 3)
 *   - purchase_returns      → return rate (reliability signal)
 *   - supplier_ledger       → outstanding exposure
 *
 * No stock/ledger side effects. Read-only analytics.
 *
 * Lead-time note (Batch 2):
 *   The ERP does not capture a separate "order placed" date.
 *   We approximate "supply cadence" as the average gap between
 *   consecutive purchases. A gap is delayed when it exceeds the
 *   supplier's median cadence × 1.5 (with a 7-day floor).
 *
 * Price trend (Batch 3):
 *   For each (supplier, product) we compare the last unit rate against
 *   the average of the previous (up to 3) rates. A supplier's overall
 *   trend is the volume-weighted direction across products with ≥ 2
 *   purchases. Bands: stable (< 3% drift), rising, falling.
 *
 * Score (0-100), explainable:
 *   start at 100, then:
 *     - subtract 2 points per 1% return rate (capped at 40)
 *     - subtract 10 points if no purchase in last 90 days
 *     - subtract 10 points if outstanding > 5x avg purchase value
 *     - subtract 10 points if delayed_pct > 30
 *   floor at 0.
 *
 *   Price trend is shown to the owner but NOT included in the score —
 *   pricing decisions are subjective (better caliber, exchange rate,
 *   negotiated terms). Keeping the score deterministic.
 */

export type ReliabilityBand = "reliable" | "average" | "at_risk" | "inactive";
export type PriceTrend = "stable" | "rising" | "falling" | "insufficient_data";

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
  last_gap_days: number | null;
  longest_gap_days: number | null;
  on_time_count: number;
  delayed_count: number;
  delayed_pct: number; // 0-100

  // reliability
  total_returns: number;
  total_return_value: number;
  return_rate_pct: number; // 0-100

  // exposure
  outstanding_amount: number;
  recent_purchase_value_30d: number;

  // price trend (Batch 3)
  price_trend: PriceTrend;
  price_change_pct: number; // signed; positive = rising
  trend_products_compared: number;

  // derived
  reliability_score: number; // 0-100
  reliability_band: ReliabilityBand;
  score_factors: string[];
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
  delayedPct: number;
}): { score: number; factors: string[] } {
  let score = 100;
  const factors: string[] = [];
  const returnPenalty = Math.min(40, args.returnRatePct * 2);
  if (returnPenalty > 0) {
    score -= returnPenalty;
    factors.push(`-${Math.round(returnPenalty)} from ${args.returnRatePct.toFixed(1)}% return rate`);
  }
  if (args.daysSinceLast !== null && args.daysSinceLast > 90) {
    score -= 10;
    factors.push(`-10 inactive ${args.daysSinceLast}d`);
  }
  if (args.avgPurchaseValue > 0 && args.outstanding > args.avgPurchaseValue * 5) {
    score -= 10;
    factors.push(`-10 high outstanding exposure`);
  }
  if (args.delayedPct > 30) {
    score -= 10;
    factors.push(`-10 ${args.delayedPct.toFixed(0)}% delayed cadence`);
  }
  return { score: Math.max(0, Math.round(score)), factors };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

interface PurchaseItemRow {
  purchase_id: string;
  product_id: string;
  purchase_rate: number;
  quantity: number;
}

/**
 * Compute price trend per supplier using purchase_items joined to purchases.
 * For each (supplier, product) with ≥2 historical rates:
 *   - last rate vs avg of previous (up to 3) rates
 *   - direction: rising (>+3%), falling (<-3%), stable
 * Aggregate across products by total quantity weight.
 */
function computePriceTrends(
  purchases: { id: string; supplier_id: string | null; purchase_date: string }[],
  items: PurchaseItemRow[],
): Map<string, { trend: PriceTrend; change_pct: number; products_compared: number }> {
  const purIndex = new Map<string, { supplier_id: string | null; date: string }>();
  for (const p of purchases) purIndex.set(p.id, { supplier_id: p.supplier_id, date: p.purchase_date });

  // Group: supplier -> product -> [{date, rate, qty}]
  const bySupplierProduct = new Map<string, Map<string, { date: string; rate: number; qty: number }[]>>();
  for (const it of items) {
    const meta = purIndex.get(it.purchase_id);
    if (!meta || !meta.supplier_id) continue;
    const rate = Number(it.purchase_rate);
    if (!isFinite(rate) || rate <= 0) continue;
    const qty = Number(it.quantity) || 0;
    let prodMap = bySupplierProduct.get(meta.supplier_id);
    if (!prodMap) {
      prodMap = new Map();
      bySupplierProduct.set(meta.supplier_id, prodMap);
    }
    const arr = prodMap.get(it.product_id) ?? [];
    arr.push({ date: meta.date, rate, qty });
    prodMap.set(it.product_id, arr);
  }

  const out = new Map<string, { trend: PriceTrend; change_pct: number; products_compared: number }>();

  for (const [supplierId, prodMap] of bySupplierProduct) {
    let weightedDrift = 0;
    let totalWeight = 0;
    let productsCompared = 0;

    for (const arr of prodMap.values()) {
      if (arr.length < 2) continue;
      const sorted = arr.slice().sort((a, b) => a.date.localeCompare(b.date));
      const last = sorted[sorted.length - 1];
      const prior = sorted.slice(Math.max(0, sorted.length - 4), sorted.length - 1);
      const priorAvg = prior.reduce((s, x) => s + x.rate, 0) / prior.length;
      if (priorAvg <= 0) continue;
      const driftPct = ((last.rate - priorAvg) / priorAvg) * 100;
      const weight = Math.max(1, last.qty);
      weightedDrift += driftPct * weight;
      totalWeight += weight;
      productsCompared += 1;
    }

    if (productsCompared === 0 || totalWeight === 0) {
      out.set(supplierId, { trend: "insufficient_data", change_pct: 0, products_compared: 0 });
      continue;
    }
    const avgDrift = weightedDrift / totalWeight;
    const trend: PriceTrend =
      avgDrift > 3 ? "rising" : avgDrift < -3 ? "falling" : "stable";
    out.set(supplierId, {
      trend,
      change_pct: Math.round(avgDrift * 100) / 100,
      products_compared: productsCompared,
    });
  }
  return out;
}

export const supplierPerformanceService = {
  async list(dealerId: string, opts: ListOptions = {}): Promise<SupplierPerformance[]> {
    const [supRes, purRes, retRes, ledRes, itemsRes] = await Promise.all([
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
      supabase
        .from("purchase_items")
        .select("purchase_id, product_id, purchase_rate, quantity")
        .eq("dealer_id", dealerId),
    ]);

    if (supRes.error) throw new Error(supRes.error.message);
    if (purRes.error) throw new Error(purRes.error.message);
    if (retRes.error) throw new Error(retRes.error.message);
    if (ledRes.error) throw new Error(ledRes.error.message);
    if (itemsRes.error) throw new Error(itemsRes.error.message);

    const suppliers = supRes.data ?? [];
    const purchases = purRes.data ?? [];
    const returns = (retRes.data ?? []).filter((r) => r.status !== "cancelled");
    const ledger = ledRes.data ?? [];
    const items = (itemsRes.data ?? []) as PurchaseItemRow[];

    const trendMap = computePriceTrends(purchases, items);

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
    const thirtyDaysAgo = today - 30 * 86_400_000;

    return suppliers.map<SupplierPerformance>((s) => {
      const pList = (purBySup.get(s.id) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
      const totalPurchases = pList.length;
      const totalPurchaseValue = pList.reduce((sum, p) => sum + p.amount, 0);
      const avgPurchaseValue = totalPurchases > 0 ? totalPurchaseValue / totalPurchases : 0;
      const lastPurchase = pList.length > 0 ? pList[pList.length - 1].date : null;
      const daysSinceLast = lastPurchase
        ? Math.floor((today - new Date(lastPurchase).getTime()) / 86_400_000)
        : null;

      const recentValue30d = pList
        .filter((p) => new Date(p.date).getTime() >= thirtyDaysAgo)
        .reduce((sum, p) => sum + p.amount, 0);

      let avgGap: number | null = null;
      let lastGap: number | null = null;
      let longestGap: number | null = null;
      let onTime = 0;
      let delayed = 0;
      let delayedPct = 0;

      if (pList.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < pList.length; i++) {
          const d = (new Date(pList[i].date).getTime() - new Date(pList[i - 1].date).getTime()) / 86_400_000;
          if (d >= 0) gaps.push(d);
        }
        if (gaps.length > 0) {
          avgGap = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
          lastGap = Math.round(gaps[gaps.length - 1]);
          longestGap = Math.round(Math.max(...gaps));
          const med = median(gaps);
          const tolerance = Math.max(med * 1.5, med + 7);
          for (const g of gaps) {
            if (g > tolerance) delayed += 1;
            else onTime += 1;
          }
          delayedPct = gaps.length > 0 ? Math.round((delayed / gaps.length) * 100) : 0;
        }
      }

      const retInfo = retBySup.get(s.id) ?? { count: 0, total: 0 };
      const returnRatePct =
        totalPurchaseValue > 0
          ? Math.round((retInfo.total / totalPurchaseValue) * 10_000) / 100
          : 0;

      const outstanding = Math.max(0, Math.round((outBySup.get(s.id) ?? 0) * 100) / 100);

      const trendInfo = trendMap.get(s.id) ?? { trend: "insufficient_data" as PriceTrend, change_pct: 0, products_compared: 0 };

      const { score, factors } = computeScore({
        returnRatePct,
        daysSinceLast,
        outstanding,
        avgPurchaseValue,
        delayedPct,
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
        last_gap_days: lastGap,
        longest_gap_days: longestGap,
        on_time_count: onTime,
        delayed_count: delayed,
        delayed_pct: delayedPct,
        total_returns: retInfo.count,
        total_return_value: Math.round(retInfo.total * 100) / 100,
        return_rate_pct: returnRatePct,
        outstanding_amount: outstanding,
        recent_purchase_value_30d: Math.round(recentValue30d * 100) / 100,
        price_trend: trendInfo.trend,
        price_change_pct: trendInfo.change_pct,
        trend_products_compared: trendInfo.products_compared,
        reliability_score: score,
        reliability_band: classify(score, lastPurchase),
        score_factors: factors,
      };
    });
  },

  async getForSupplier(dealerId: string, supplierId: string): Promise<SupplierPerformance | null> {
    const all = await this.list(dealerId);
    return all.find((s) => s.supplier_id === supplierId) ?? null;
  },

  /**
   * Per-product price trend detail for a single supplier.
   * Used in supplier detail drilldown.
   */
  async getPriceTrendDetail(dealerId: string, supplierId: string) {
    const [purRes, itemsRes, prodRes] = await Promise.all([
      supabase
        .from("purchases")
        .select("id, supplier_id, purchase_date")
        .eq("dealer_id", dealerId)
        .eq("supplier_id", supplierId),
      supabase
        .from("purchase_items")
        .select("purchase_id, product_id, purchase_rate, quantity")
        .eq("dealer_id", dealerId),
      supabase
        .from("products")
        .select("id, name, sku")
        .eq("dealer_id", dealerId),
    ]);
    if (purRes.error) throw new Error(purRes.error.message);
    if (itemsRes.error) throw new Error(itemsRes.error.message);
    if (prodRes.error) throw new Error(prodRes.error.message);

    const purIds = new Set((purRes.data ?? []).map((p) => p.id));
    const purDate = new Map((purRes.data ?? []).map((p) => [p.id, p.purchase_date] as const));
    const products = new Map((prodRes.data ?? []).map((p) => [p.id, p] as const));

    const grouped = new Map<string, { date: string; rate: number; qty: number }[]>();
    for (const it of itemsRes.data ?? []) {
      if (!purIds.has(it.purchase_id)) continue;
      const rate = Number(it.purchase_rate);
      if (!isFinite(rate) || rate <= 0) continue;
      const arr = grouped.get(it.product_id) ?? [];
      arr.push({
        date: purDate.get(it.purchase_id) ?? "",
        rate,
        qty: Number(it.quantity) || 0,
      });
      grouped.set(it.product_id, arr);
    }

    const rows = Array.from(grouped.entries())
      .map(([productId, arr]) => {
        const sorted = arr.slice().sort((a, b) => a.date.localeCompare(b.date));
        const last = sorted[sorted.length - 1];
        const first = sorted[0];
        const prior = sorted.slice(Math.max(0, sorted.length - 4), sorted.length - 1);
        const priorAvg = prior.length > 0 ? prior.reduce((s, x) => s + x.rate, 0) / prior.length : last.rate;
        const driftPct = priorAvg > 0 ? ((last.rate - priorAvg) / priorAvg) * 100 : 0;
        const product = products.get(productId);
        return {
          product_id: productId,
          product_name: product?.name ?? "Unknown",
          sku: product?.sku ?? "",
          purchases: sorted.length,
          first_rate: first.rate,
          last_rate: last.rate,
          avg_prior_rate: Math.round(priorAvg * 100) / 100,
          change_pct: Math.round(driftPct * 100) / 100,
          last_date: last.date,
        };
      })
      .filter((r) => r.purchases >= 2)
      .sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));

    return rows;
  },

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

    const highReturn = active
      .filter((s) => s.return_rate_pct >= 5)
      .sort((a, b) => b.return_rate_pct - a.return_rate_pct)
      .slice(0, 5);

    const risingPrices = active
      .filter((s) => s.price_trend === "rising")
      .sort((a, b) => b.price_change_pct - a.price_change_pct)
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
      highReturnCount: highReturn.length,
      risingPriceCount: risingPrices.length,
      totalOutstanding:
        Math.round(active.reduce((sum, s) => sum + s.outstanding_amount, 0) * 100) / 100,
      topReliable,
      atRisk,
      highOutstanding,
      highReturn,
      risingPrices,
    };
  },
};
