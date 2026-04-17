import { supabase } from "@/integrations/supabase/client";
import { stockService } from "@/services/stockService";
import { logAudit } from "@/services/auditService";

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

async function getOrCreateDisplayRow(productId: string, dealerId: string) {
  const { data: existing } = await supabase
    .from("display_stock")
    .select("*")
    .eq("dealer_id", dealerId)
    .eq("product_id", productId)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("display_stock")
    .insert({ dealer_id: dealerId, product_id: productId, display_qty: 0 })
    .select()
    .single();
  if (error) throw new Error(`Display stock init failed: ${error.message}`);
  return data;
}

export const displayStockService = {
  /**
   * List all display stock rows for a dealer.
   */
  async list(dealerId: string): Promise<DisplayStockRow[]> {
    const { data, error } = await supabase
      .from("display_stock")
      .select("*, product:products(name, sku, unit_type)")
      .eq("dealer_id", dealerId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as DisplayStockRow[];
  },

  /**
   * Move N units from sellable → display.
   * Deducts sellable stock, increments display_qty, logs movement.
   */
  async moveToDisplay(
    productId: string,
    quantity: number,
    dealerId: string,
    notes?: string
  ) {
    if (quantity <= 0) throw new Error("Quantity must be positive");

    // 1. Deduct from sellable stock (will throw if insufficient)
    await stockService.deductStock(productId, quantity, dealerId);

    // 2. Increment display_qty
    const row = await getOrCreateDisplayRow(productId, dealerId);
    const newQty = Number(row.display_qty) + quantity;
    const { error } = await supabase
      .from("display_stock")
      .update({ display_qty: newQty, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw new Error(`Display stock update failed: ${error.message}`);

    // 3. Audit movement
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    await supabase.from("display_movements").insert({
      dealer_id: dealerId,
      product_id: productId,
      movement_type: "to_display",
      quantity,
      notes: notes ?? null,
      created_by: userId,
    });

    await logAudit({
      dealer_id: dealerId,
      action: "display_move_in",
      table_name: "display_stock",
      record_id: row.id,
      new_data: { product_id: productId, quantity, notes },
    });
  },

  /**
   * Move N units from display back → sellable.
   */
  async moveBackToSellable(
    productId: string,
    quantity: number,
    dealerId: string,
    notes?: string
  ) {
    if (quantity <= 0) throw new Error("Quantity must be positive");

    const row = await getOrCreateDisplayRow(productId, dealerId);
    if (Number(row.display_qty) < quantity) {
      throw new Error(`Insufficient display stock (have ${row.display_qty}, need ${quantity})`);
    }

    // Add back to sellable
    await stockService.addStock(productId, quantity, dealerId);

    const { error } = await supabase
      .from("display_stock")
      .update({
        display_qty: Number(row.display_qty) - quantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw new Error(`Display stock update failed: ${error.message}`);

    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    await supabase.from("display_movements").insert({
      dealer_id: dealerId,
      product_id: productId,
      movement_type: "from_display",
      quantity,
      notes: notes ?? null,
      created_by: userId,
    });

    await logAudit({
      dealer_id: dealerId,
      action: "display_move_out",
      table_name: "display_stock",
      record_id: row.id,
      new_data: { product_id: productId, quantity, notes },
    });
  },

  /**
   * Mark display unit(s) as damaged. Reduces display_qty without restoring sellable.
   */
  async markDisplayDamaged(
    productId: string,
    quantity: number,
    dealerId: string,
    notes?: string
  ) {
    if (quantity <= 0) throw new Error("Quantity must be positive");

    const row = await getOrCreateDisplayRow(productId, dealerId);
    if (Number(row.display_qty) < quantity) {
      throw new Error(`Insufficient display stock`);
    }

    const { error } = await supabase
      .from("display_stock")
      .update({
        display_qty: Number(row.display_qty) - quantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);

    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    await supabase.from("display_movements").insert({
      dealer_id: dealerId,
      product_id: productId,
      movement_type: "display_damaged",
      quantity,
      notes: notes ?? null,
      created_by: userId,
    });

    await logAudit({
      dealer_id: dealerId,
      action: "display_damaged",
      table_name: "display_stock",
      record_id: row.id,
      new_data: { product_id: productId, quantity, notes },
    });
  },

  /**
   * Replace damaged display unit with new sellable stock.
   * Net effect: -N sellable, display_qty unchanged (1 damaged out, 1 fresh in).
   */
  async replaceDisplay(
    productId: string,
    quantity: number,
    dealerId: string,
    notes?: string
  ) {
    if (quantity <= 0) throw new Error("Quantity must be positive");

    await stockService.deductStock(productId, quantity, dealerId);

    const row = await getOrCreateDisplayRow(productId, dealerId);
    const { error } = await supabase
      .from("display_stock")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw new Error(error.message);

    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    await supabase.from("display_movements").insert({
      dealer_id: dealerId,
      product_id: productId,
      movement_type: "display_replaced",
      quantity,
      notes: notes ?? null,
      created_by: userId,
    });

    await logAudit({
      dealer_id: dealerId,
      action: "display_replaced",
      table_name: "display_stock",
      record_id: row.id,
      new_data: { product_id: productId, quantity, notes },
    });
  },

  /**
   * Display movement history (audit trail) for a dealer.
   */
  async listMovements(dealerId: string) {
    const { data, error } = await supabase
      .from("display_movements")
      .select("*, product:products(name, sku, unit_type)")
      .eq("dealer_id", dealerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};

export const sampleIssueService = {
  /**
   * List sample issues for a dealer (newest first).
   */
  async list(dealerId: string, status?: SampleStatus): Promise<SampleIssueRow[]> {
    let query = supabase
      .from("sample_issues")
      .select("*, product:products(name, sku, unit_type), customer:customers(name)")
      .eq("dealer_id", dealerId)
      .order("issue_date", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as SampleIssueRow[];
  },

  /**
   * Issue sample to a recipient. Deducts from sellable stock immediately.
   */
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
    if (input.quantity <= 0) throw new Error("Quantity must be positive");
    if (!input.recipient_name.trim()) throw new Error("Recipient name is required");

    // Deduct from sellable stock
    await stockService.deductStock(input.product_id, input.quantity, input.dealer_id);

    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { data, error } = await supabase
      .from("sample_issues")
      .insert({
        dealer_id: input.dealer_id,
        product_id: input.product_id,
        quantity: input.quantity,
        recipient_type: input.recipient_type,
        recipient_name: input.recipient_name.trim(),
        recipient_phone: input.recipient_phone?.trim() || null,
        customer_id: input.customer_id || null,
        expected_return_date: input.expected_return_date || null,
        notes: input.notes?.trim() || null,
        status: "issued",
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(`Sample issue failed: ${error.message}`);

    await logAudit({
      dealer_id: input.dealer_id,
      action: "sample_issued",
      table_name: "sample_issues",
      record_id: data.id,
      new_data: input,
    });

    return data as SampleIssueRow;
  },

  /**
   * Return a sample (or part of it).
   *
   * Business rules:
   *   - return_to = "sellable"  → restock to sellable inventory
   *   - return_to = "display"   → put unit(s) on showroom display
   *   - return_to = "damaged"   → mark damaged, no stock restoration
   *
   * Sets status:
   *   - returned         (returned_qty + damaged_qty + lost_qty == quantity)
   *   - partially_returned (otherwise, when any return_qty > 0)
   */
  async returnSample(input: {
    sample_id: string;
    dealer_id: string;
    return_qty: number;
    return_to: "sellable" | "display" | "damaged";
    notes?: string;
  }): Promise<SampleIssueRow> {
    if (input.return_qty <= 0) throw new Error("Return quantity must be positive");

    const { data: sample, error: fetchErr } = await supabase
      .from("sample_issues")
      .select("*")
      .eq("id", input.sample_id)
      .eq("dealer_id", input.dealer_id)
      .single();
    if (fetchErr || !sample) throw new Error("Sample not found");
    if (sample.status === "returned" || sample.status === "lost")
      throw new Error(`Sample is already ${sample.status}`);

    const remaining =
      Number(sample.quantity) -
      Number(sample.returned_qty) -
      Number(sample.damaged_qty) -
      Number(sample.lost_qty);
    if (input.return_qty > remaining)
      throw new Error(`Cannot return ${input.return_qty} — only ${remaining} outstanding`);

    // Apply stock movement based on return condition
    if (input.return_to === "sellable") {
      await stockService.addStock(sample.product_id, input.return_qty, input.dealer_id);
    } else if (input.return_to === "display") {
      const row = await getOrCreateDisplayRow(sample.product_id, input.dealer_id);
      const { error } = await supabase
        .from("display_stock")
        .update({
          display_qty: Number(row.display_qty) + input.return_qty,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw new Error(`Display stock update failed: ${error.message}`);

      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
      await supabase.from("display_movements").insert({
        dealer_id: input.dealer_id,
        product_id: sample.product_id,
        movement_type: "to_display",
        quantity: input.return_qty,
        notes: `Sample return → display: ${input.notes ?? ""}`,
        created_by: userId,
      });
    }
    // "damaged" → no stock restoration; just record on sample row

    // Update sample counters and status
    const newReturned =
      input.return_to === "damaged"
        ? Number(sample.returned_qty)
        : Number(sample.returned_qty) + input.return_qty;
    const newDamaged =
      input.return_to === "damaged"
        ? Number(sample.damaged_qty) + input.return_qty
        : Number(sample.damaged_qty);

    const totalSettled = newReturned + newDamaged + Number(sample.lost_qty);
    const newStatus: SampleStatus =
      totalSettled >= Number(sample.quantity) ? "returned" : "partially_returned";

    const { data: updated, error: updErr } = await supabase
      .from("sample_issues")
      .update({
        returned_qty: newReturned,
        damaged_qty: newDamaged,
        status: newStatus,
        returned_date:
          newStatus === "returned" ? new Date().toISOString().slice(0, 10) : sample.returned_date,
        notes: input.notes
          ? `${sample.notes ? sample.notes + "\n" : ""}[Return ${input.return_to}] ${input.notes}`
          : sample.notes,
      })
      .eq("id", input.sample_id)
      .select("*, product:products(name, sku, unit_type), customer:customers(name)")
      .single();
    if (updErr) throw new Error(updErr.message);

    await logAudit({
      dealer_id: input.dealer_id,
      action: `sample_return_${input.return_to}`,
      table_name: "sample_issues",
      record_id: input.sample_id,
      old_data: { status: sample.status, returned_qty: sample.returned_qty, damaged_qty: sample.damaged_qty },
      new_data: { return_qty: input.return_qty, return_to: input.return_to, new_status: newStatus, notes: input.notes },
    });

    return updated as SampleIssueRow;
  },

  /**
   * Mark a sample as fully lost (or partially lost).
   * No stock restoration. Requires a reason.
   */
  async markSampleLost(input: {
    sample_id: string;
    dealer_id: string;
    lost_qty: number;
    reason: string;
  }): Promise<SampleIssueRow> {
    if (input.lost_qty <= 0) throw new Error("Lost quantity must be positive");
    if (!input.reason.trim()) throw new Error("Reason is required for lost samples");

    const { data: sample, error: fetchErr } = await supabase
      .from("sample_issues")
      .select("*")
      .eq("id", input.sample_id)
      .eq("dealer_id", input.dealer_id)
      .single();
    if (fetchErr || !sample) throw new Error("Sample not found");

    const remaining =
      Number(sample.quantity) -
      Number(sample.returned_qty) -
      Number(sample.damaged_qty) -
      Number(sample.lost_qty);
    if (input.lost_qty > remaining)
      throw new Error(`Cannot mark ${input.lost_qty} lost — only ${remaining} outstanding`);

    const newLost = Number(sample.lost_qty) + input.lost_qty;
    const totalSettled = Number(sample.returned_qty) + Number(sample.damaged_qty) + newLost;
    const newStatus: SampleStatus =
      totalSettled >= Number(sample.quantity)
        ? newLost === Number(sample.quantity)
          ? "lost"
          : "returned"
        : "partially_returned";

    const { data: updated, error: updErr } = await supabase
      .from("sample_issues")
      .update({
        lost_qty: newLost,
        status: newStatus,
        notes: `${sample.notes ? sample.notes + "\n" : ""}[Lost] ${input.reason}`,
      })
      .eq("id", input.sample_id)
      .select("*, product:products(name, sku, unit_type), customer:customers(name)")
      .single();
    if (updErr) throw new Error(updErr.message);

    await logAudit({
      dealer_id: input.dealer_id,
      action: "sample_marked_lost",
      table_name: "sample_issues",
      record_id: input.sample_id,
      old_data: { lost_qty: sample.lost_qty, status: sample.status },
      new_data: { lost_qty: input.lost_qty, reason: input.reason, new_status: newStatus },
    });

    return updated as SampleIssueRow;
  },

  /**
   * Aggregate stats for dashboard widgets.
   */
  async getDashboardStats(dealerId: string) {
    const [{ data: samples }, { data: display }] = await Promise.all([
      supabase
        .from("sample_issues")
        .select("status, quantity, returned_qty, damaged_qty, lost_qty, issue_date, expected_return_date")
        .eq("dealer_id", dealerId),
      supabase
        .from("display_stock")
        .select("display_qty")
        .eq("dealer_id", dealerId),
    ]);

    const outstanding = (samples ?? []).filter(
      (s) => s.status === "issued" || s.status === "partially_returned"
    );

    const totalDisplayQty = (display ?? []).reduce((sum, d) => sum + Number(d.display_qty), 0);

    const damagedLostCount = (samples ?? []).filter(
      (s) =>
        s.status === "damaged" ||
        s.status === "lost" ||
        Number(s.damaged_qty) > 0 ||
        Number(s.lost_qty) > 0
    ).length;

    // Oldest outstanding sample (by issue_date)
    const oldest = outstanding
      .slice()
      .sort((a, b) => (a.issue_date < b.issue_date ? -1 : 1))[0];

    const today = new Date();
    const oldestDays = oldest
      ? Math.floor((today.getTime() - new Date(oldest.issue_date).getTime()) / 86400000)
      : 0;

    return {
      outstandingSamples: outstanding.length,
      totalDisplayQty,
      damagedLostCount,
      oldestOutstandingDays: oldestDays,
      oldestOutstandingDate: oldest?.issue_date ?? null,
    };
  },
};
