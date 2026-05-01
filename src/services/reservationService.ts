import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export interface ReservationInput {
  dealer_id: string;
  product_id: string;
  batch_id?: string | null;
  customer_id: string;
  reserved_qty: number;
  unit_type: string;
  reason?: string;
  expires_at?: string | null;
  created_by?: string;
}

export interface Reservation {
  id: string;
  dealer_id: string;
  product_id: string;
  batch_id: string | null;
  customer_id: string;
  reserved_qty: number;
  fulfilled_qty: number;
  released_qty: number;
  reason: string | null;
  release_reason: string | null;
  source_type: string;
  status: string;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  products?: { name: string; sku: string; unit_type: string; category: string };
  customers?: { name: string };
  product_batches?: { batch_no: string; shade_code: string | null; caliber: string | null } | null;
}

async function vpsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

export async function createReservation(input: ReservationInput): Promise<string> {
  const body = await vpsRequest<{ id: string }>(`/api/reservations`, {
    method: "POST",
    body: JSON.stringify({
      dealer_id: input.dealer_id,
      product_id: input.product_id,
      batch_id: input.batch_id ?? null,
      customer_id: input.customer_id,
      reserved_qty: input.reserved_qty,
      unit_type: input.unit_type,
      reason: input.reason ?? null,
      expires_at: input.expires_at ?? null,
    }),
  });
  return body.id;
}

export async function releaseReservation(
  reservationId: string,
  dealerId: string,
  releaseReason: string
): Promise<void> {
  await vpsRequest(`/api/reservations/${reservationId}/release?dealerId=${dealerId}`, {
    method: "POST",
    body: JSON.stringify({ release_reason: releaseReason }),
  });
}

export async function extendReservation(
  reservationId: string,
  dealerId: string,
  newExpiresAt: string,
  reason: string
): Promise<void> {
  await vpsRequest(`/api/reservations/${reservationId}/extend?dealerId=${dealerId}`, {
    method: "POST",
    body: JSON.stringify({ expires_at: newExpiresAt, reason }),
  });
}

export async function consumeReservation(
  reservationId: string,
  dealerId: string,
  saleItemId: string,
  consumeQty: number
): Promise<void> {
  await vpsRequest(`/api/reservations/${reservationId}/consume?dealerId=${dealerId}`, {
    method: "POST",
    body: JSON.stringify({ sale_item_id: saleItemId, consume_qty: consumeQty }),
  });
}

export async function getCustomerProductReservations(
  customerId: string,
  productId: string,
  dealerId: string
): Promise<Reservation[]> {
  const body = await vpsRequest<{ rows: Reservation[] }>(
    `/api/reservations/by-customer-product?dealerId=${dealerId}&customerId=${customerId}&productId=${productId}`,
  );
  return body.rows ?? [];
}

export async function expireStaleReservations(dealerId: string): Promise<number> {
  const body = await vpsRequest<{ expired: number }>(
    `/api/reservations/expire-stale?dealerId=${dealerId}`,
    { method: "POST" },
  );
  return body.expired ?? 0;
}

export async function listReservations(
  dealerId: string,
  filters?: { status?: string; product_id?: string; customer_id?: string }
): Promise<Reservation[]> {
  const params = new URLSearchParams({ dealerId });
  if (filters?.status) params.set("status", filters.status);
  if (filters?.product_id) params.set("product_id", filters.product_id);
  if (filters?.customer_id) params.set("customer_id", filters.customer_id);
  const body = await vpsRequest<{ rows: Reservation[] }>(`/api/reservations?${params}`);
  return body.rows ?? [];
}

export async function getProductReservations(
  productId: string,
  dealerId: string
): Promise<Reservation[]> {
  const body = await vpsRequest<{ rows: Reservation[] }>(
    `/api/reservations/by-product/${productId}?dealerId=${dealerId}`,
  );
  return body.rows ?? [];
}
