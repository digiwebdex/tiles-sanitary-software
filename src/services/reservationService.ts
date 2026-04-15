import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";

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
  // Joined fields
  products?: { name: string; sku: string; unit_type: string; category: string };
  customers?: { name: string };
  product_batches?: { batch_no: string; shade_code: string | null; caliber: string | null } | null;
}

/**
 * Create a reservation using the atomic RPC.
 * This atomically updates product_batches.reserved_* and stock.reserved_* in one transaction.
 */
export async function createReservation(input: ReservationInput): Promise<string> {
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

  // Audit log
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

/**
 * Release (cancel) an active reservation using the atomic RPC.
 */
export async function releaseReservation(
  reservationId: string,
  dealerId: string,
  releaseReason: string
): Promise<void> {
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

/**
 * Extend expiry of an active reservation.
 */
export async function extendReservation(
  reservationId: string,
  dealerId: string,
  newExpiresAt: string,
  reason: string
): Promise<void> {
  // Fetch old expiry for audit
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

/**
 * Expire stale reservations for a dealer.
 */
export async function expireStaleReservations(dealerId: string): Promise<number> {
  const { data, error } = await supabase.rpc("expire_stale_reservations", {
    _dealer_id: dealerId,
  });

  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

/**
 * List reservations with filtering.
 */
export async function listReservations(
  dealerId: string,
  filters?: { status?: string; product_id?: string; customer_id?: string }
): Promise<Reservation[]> {
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

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.product_id) {
    query = query.eq("product_id", filters.product_id);
  }
  if (filters?.customer_id) {
    query = query.eq("customer_id", filters.customer_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Reservation[];
}

/**
 * Get active reservations for a specific product (used in stock visibility).
 */
export async function getProductReservations(
  productId: string,
  dealerId: string
): Promise<Reservation[]> {
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
