import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";
import { env } from "@/lib/env";
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

const USE_VPS = env.AUTH_BACKEND === "vps";

async function vpsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

/**
 * Create a reservation. On VPS the route runs RPC + audit inside one txn.
 */
export async function createReservation(input: ReservationInput): Promise<string> {
  if (USE_VPS) {
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

  const { data, error } = await supabase.rpc("create_stock_reservation", {
    _dealer_id: input.dealer_id,
    _product_id: input.product_id,
    _batch_id: input.batch_id ?? null,
    _customer_id: input.customer_id,
    _qty: input.reserved_qty,
    _unit_type: input.unit_type,
    _reason: input.reason ?? null,
    _expires_at: input.expires_at ?? null,
    _created_by: input.created_by ?? null,
  });

  if (error) throw new Error(error.message);

  await logAudit({
    dealer_id: input.dealer_id,
    action: "RESERVATION_CREATED",
    table_name: "stock_reservations",
    record_id: data as string,
    new_data: {
      product_id: input.product_id,
      batch_id: input.batch_id,
      customer_id: input.customer_id,
      reserved_qty: input.reserved_qty,
      reason: input.reason,
    } as any,
  });

  return data as string;
}

export async function releaseReservation(
  reservationId: string,
  dealerId: string,
  releaseReason: string
): Promise<void> {
  if (USE_VPS) {
    await vpsRequest(`/api/reservations/${reservationId}/release?dealerId=${dealerId}`, {
      method: "POST",
      body: JSON.stringify({ release_reason: releaseReason }),
    });
    return;
  }

  const { error } = await supabase.rpc("release_stock_reservation", {
    _reservation_id: reservationId,
    _dealer_id: dealerId,
    _release_reason: releaseReason,
  });
  if (error) throw new Error(error.message);

  await logAudit({
    dealer_id: dealerId,
    action: "RESERVATION_RELEASED",
    table_name: "stock_reservations",
    record_id: reservationId,
    new_data: { release_reason: releaseReason } as any,
  });
}

export async function extendReservation(
  reservationId: string,
  dealerId: string,
  newExpiresAt: string,
  reason: string
): Promise<void> {
  if (USE_VPS) {
    await vpsRequest(`/api/reservations/${reservationId}/extend?dealerId=${dealerId}`, {
      method: "POST",
      body: JSON.stringify({ expires_at: newExpiresAt, reason }),
    });
    return;
  }

  const { data: old } = await supabase
    .from("stock_reservations")
    .select("expires_at")
    .eq("id", reservationId)
    .single();

  const { error } = await supabase
    .from("stock_reservations")
    .update({ expires_at: newExpiresAt } as any)
    .eq("id", reservationId)
    .eq("dealer_id", dealerId)
    .eq("status", "active");

  if (error) throw new Error(error.message);

  await logAudit({
    dealer_id: dealerId,
    action: "RESERVATION_EXTENDED",
    table_name: "stock_reservations",
    record_id: reservationId,
    old_data: { expires_at: old?.expires_at } as any,
    new_data: { expires_at: newExpiresAt, reason } as any,
  });
}

export async function consumeReservation(
  reservationId: string,
  dealerId: string,
  saleItemId: string,
  consumeQty: number
): Promise<void> {
  if (USE_VPS) {
    await vpsRequest(`/api/reservations/${reservationId}/consume?dealerId=${dealerId}`, {
      method: "POST",
      body: JSON.stringify({ sale_item_id: saleItemId, consume_qty: consumeQty }),
    });
    return;
  }

  const { error } = await supabase.rpc("consume_reservation_for_sale", {
    _reservation_id: reservationId,
    _dealer_id: dealerId,
    _sale_item_id: saleItemId,
    _consume_qty: consumeQty,
  });
  if (error) throw new Error(error.message);

  await logAudit({
    dealer_id: dealerId,
    action: "RESERVATION_CONSUMED",
    table_name: "stock_reservations",
    record_id: reservationId,
    new_data: {
      sale_item_id: saleItemId,
      consumed_qty: consumeQty,
    } as any,
  });
}

export async function getCustomerProductReservations(
  customerId: string,
  productId: string,
  dealerId: string
): Promise<Reservation[]> {
  if (USE_VPS) {
    const body = await vpsRequest<{ rows: Reservation[] }>(
      `/api/reservations/by-customer-product?dealerId=${dealerId}&customerId=${customerId}&productId=${productId}`,
    );
    return body.rows ?? [];
  }

  const { data, error } = await supabase
    .from("stock_reservations")
    .select(`
      *,
      product_batches:batch_id (batch_no, shade_code, caliber)
    `)
    .eq("customer_id", customerId)
    .eq("product_id", productId)
    .eq("dealer_id", dealerId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Reservation[];
}

export async function expireStaleReservations(dealerId: string): Promise<number> {
  if (USE_VPS) {
    const body = await vpsRequest<{ expired: number }>(
      `/api/reservations/expire-stale?dealerId=${dealerId}`,
      { method: "POST" },
    );
    return body.expired ?? 0;
  }

  const { data, error } = await supabase.rpc("expire_stale_reservations", {
    _dealer_id: dealerId,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export async function listReservations(
  dealerId: string,
  filters?: { status?: string; product_id?: string; customer_id?: string }
): Promise<Reservation[]> {
  if (USE_VPS) {
    const params = new URLSearchParams({ dealerId });
    if (filters?.status) params.set("status", filters.status);
    if (filters?.product_id) params.set("product_id", filters.product_id);
    if (filters?.customer_id) params.set("customer_id", filters.customer_id);
    const body = await vpsRequest<{ rows: Reservation[] }>(
      `/api/reservations?${params}`,
    );
    return body.rows ?? [];
  }

  let query = supabase
    .from("stock_reservations")
    .select(`
      *,
      products:product_id (name, sku, unit_type, category),
      customers:customer_id (name),
      product_batches:batch_id (batch_no, shade_code, caliber)
    `)
    .eq("dealer_id", dealerId)
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.product_id) query = query.eq("product_id", filters.product_id);
  if (filters?.customer_id) query = query.eq("customer_id", filters.customer_id);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Reservation[];
}

export async function getProductReservations(
  productId: string,
  dealerId: string
): Promise<Reservation[]> {
  if (USE_VPS) {
    const body = await vpsRequest<{ rows: Reservation[] }>(
      `/api/reservations/by-product/${productId}?dealerId=${dealerId}`,
    );
    return body.rows ?? [];
  }

  const { data, error } = await supabase
    .from("stock_reservations")
    .select(`
      *,
      customers:customer_id (name),
      product_batches:batch_id (batch_no, shade_code, caliber)
    `)
    .eq("product_id", productId)
    .eq("dealer_id", dealerId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Reservation[];
}
