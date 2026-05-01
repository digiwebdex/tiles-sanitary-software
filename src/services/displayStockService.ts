/**
 * Display Stock + Sample Issues — VPS-backed (Phase 3U-15).
 * Public surface preserved; all stock + audit side effects atomic on backend.
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export type DisplayMovementType = "to_display" | "from_display" | "display_damaged" | "display_replaced";
export type SampleStatus = "issued" | "returned" | "partially_returned" | "damaged" | "lost";
export type SampleRecipientType = "customer" | "architect" | "contractor" | "mason" | "other";

export interface DisplayStockRow {
  id: string;
  dealer_id: string;
  product_id: string;
  display_qty: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product?: { name: string; sku: string; unit_type: string } | null;
}

export interface SampleIssueRow {
  id: string;
  dealer_id: string;
  product_id: string;
  quantity: number;
  returned_qty: number;
  damaged_qty: number;
  lost_qty: number;
  recipient_type: SampleRecipientType;
  recipient_name: string;
  recipient_phone: string | null;
  customer_id: string | null;
  issue_date: string;
  expected_return_date: string | null;
  returned_date: string | null;
  status: SampleStatus;
  notes: string | null;
  created_at: string;
  product?: { name: string; sku: string; unit_type: string } | null;
  customer?: { name: string } | null;
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

export const displayStockService = {
  async list(dealerId: string): Promise<DisplayStockRow[]> {
    const body = await vpsJson<{ rows: DisplayStockRow[] }>(
      `/api/display-stock/list?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return body.rows ?? [];
  },

  async moveToDisplay(productId: string, quantity: number, dealerId: string, notes?: string) {
    await vpsJson(`/api/display-stock/move-to-display`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId, product_id: productId, quantity, notes }),
    });
  },

  async moveBackToSellable(productId: string, quantity: number, dealerId: string, notes?: string) {
    await vpsJson(`/api/display-stock/move-back`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId, product_id: productId, quantity, notes }),
    });
  },

  async markDisplayDamaged(productId: string, quantity: number, dealerId: string, notes?: string) {
    await vpsJson(`/api/display-stock/mark-damaged`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId, product_id: productId, quantity, notes }),
    });
  },

  async replaceDisplay(productId: string, quantity: number, dealerId: string, notes?: string) {
    await vpsJson(`/api/display-stock/replace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId, product_id: productId, quantity, notes }),
    });
  },

  async listMovements(dealerId: string) {
    const body = await vpsJson<{ rows: any[] }>(
      `/api/display-stock/movements?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return body.rows ?? [];
  },
};

export const sampleIssueService = {
  async list(dealerId: string, status?: SampleStatus): Promise<SampleIssueRow[]> {
    const qs = new URLSearchParams({ dealerId });
    if (status) qs.set("status", status);
    const body = await vpsJson<{ rows: SampleIssueRow[] }>(`/api/sample-issues?${qs}`);
    return body.rows ?? [];
  },

  async issueSample(input: {
    dealer_id: string;
    product_id: string;
    quantity: number;
    recipient_type: SampleRecipientType;
    recipient_name: string;
    recipient_phone?: string;
    customer_id?: string;
    expected_return_date?: string;
    notes?: string;
  }): Promise<SampleIssueRow> {
    const body = await vpsJson<{ row: SampleIssueRow }>(`/api/sample-issues/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealerId: input.dealer_id,
        product_id: input.product_id,
        quantity: input.quantity,
        recipient_type: input.recipient_type,
        recipient_name: input.recipient_name,
        recipient_phone: input.recipient_phone,
        customer_id: input.customer_id,
        expected_return_date: input.expected_return_date,
        notes: input.notes,
      }),
    });
    return body.row;
  },

  async returnSample(input: {
    sample_id: string;
    dealer_id: string;
    return_qty: number;
    return_to: "sellable" | "display" | "damaged";
    notes?: string;
  }): Promise<SampleIssueRow> {
    const body = await vpsJson<{ row: SampleIssueRow }>(
      `/api/sample-issues/${input.sample_id}/return`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealerId: input.dealer_id,
          return_qty: input.return_qty,
          return_to: input.return_to,
          notes: input.notes,
        }),
      },
    );
    return body.row;
  },

  async markSampleLost(input: {
    sample_id: string;
    dealer_id: string;
    lost_qty: number;
    reason: string;
  }): Promise<SampleIssueRow> {
    const body = await vpsJson<{ row: SampleIssueRow }>(
      `/api/sample-issues/${input.sample_id}/lost`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealerId: input.dealer_id,
          lost_qty: input.lost_qty,
          reason: input.reason,
        }),
      },
    );
    return body.row;
  },

  async getDashboardStats(dealerId: string) {
    return vpsJson<{
      outstandingSamples: number;
      totalDisplayQty: number;
      damagedLostCount: number;
      oldestOutstandingDays: number;
      oldestOutstandingDate: string | null;
    }>(`/api/sample-issues/dashboard-stats?dealerId=${encodeURIComponent(dealerId)}`);
  },
};
