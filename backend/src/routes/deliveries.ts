/**
 * Deliveries routes — Phase 3O.
 *
 *   POST  /api/deliveries                ← create delivery (over-delivery guard, batch RPC, sale_status sync)
 *   PATCH /api/deliveries/:id/status     ← update delivery status
 *
 * Atomic semantics: each mutation wraps all side-effects in a single Knex
 * transaction so a failure rolls back partial state. Reads continue to use
 * the existing Supabase service for now (Phase 3O is mutations-only).
 *
 * Per-line fulfillment promotion mirrors the legacy deliveryService:
 *   delivered >= ordered  → 'fulfilled'
 *   0 < delivered < ord.  → 'partially_delivered'
 *   else                  → leave allocation-derived status untouched
 *
 * Sale-level promotion:
 *   all delivered → 'delivered'
 *   some delivered → 'partially_delivered'
 *   else → leave existing sale_status
 *
 * On full delivery, this route also calls the existing
 * `promote_commission_to_earned_if_fully_delivered(_sale_id, _dealer_id)`
 * SQL function (best-effort; non-fatal on failure).
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';

const router = Router();
router.use(authenticate, tenantGuard);

function resolveDealer(req: Request, res: Response): string | null {
  const isSuper = req.user?.roles.includes('super_admin');
  const claimed =
    (req.query.dealerId as string | undefined) ||
    (req.body?.dealer_id as string | undefined) ||
    undefined;
  if (isSuper) {
    if (!claimed) {
      res.status(400).json({ error: 'super_admin must specify dealerId' });
      return null;
    }
    return claimed;
  }
  if (!req.dealerId) {
    res.status(403).json({ error: 'No dealer assigned to your account' });
    return null;
  }
  if (claimed && claimed !== req.dealerId) {
    res.status(403).json({ error: 'dealerId mismatch' });
    return null;
  }
  return req.dealerId;
}

function requireAdmin(req: Request, res: Response): boolean {
  const roles = (req.user?.roles ?? []) as string[];
  if (!roles.includes('dealer_admin') && !roles.includes('super_admin')) {
    res.status(403).json({ error: 'Only dealer_admin can manage deliveries' });
    return false;
  }
  return true;
}

function clientMeta(req: Request) {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    null;
  const ua = (req.headers['user-agent'] as string) || null;
  return { ip, ua };
}

async function generateDeliveryNo(trx: any, dealerId: string): Promise<string> {
  const row = await trx('deliveries')
    .where({ dealer_id: dealerId })
    .count<{ count: string }[]>('id as count');
  const seq = Number(row?.[0]?.count ?? 0) + 1;
  return `DL-${String(seq).padStart(5, '0')}`;
}

/**
 * Recompute per-line fulfillment_status + sale-level sale_status based on
 * cumulative delivered quantities. Mirrors deliveryService.updateSaleDeliveryStatus.
 */
async function syncSaleDeliveryStatus(trx: any, saleId: string, dealerId: string) {
  const saleItems = await trx('sale_items')
    .where({ sale_id: saleId, dealer_id: dealerId })
    .select('id', 'quantity', 'backorder_qty', 'allocated_qty', 'fulfillment_status');

  const deliveryRows = await trx('deliveries')
    .where({ sale_id: saleId, dealer_id: dealerId })
    .select('id');
  const deliveryIds = deliveryRows.map((d: any) => d.id);

  const deliveredQty: Record<string, number> = {};
  if (deliveryIds.length > 0) {
    const items = await trx('delivery_items')
      .whereIn('delivery_id', deliveryIds)
      .select('sale_item_id', 'quantity');
    for (const it of items) {
      deliveredQty[it.sale_item_id] =
        (deliveredQty[it.sale_item_id] || 0) + Number(it.quantity);
    }
  }

  let totalOrdered = 0;
  let totalDelivered = 0;

  for (const si of saleItems) {
    const ordered = Number(si.quantity);
    const delivered = deliveredQty[si.id] || 0;
    totalOrdered += ordered;
    totalDelivered += delivered;

    let nextStatus: string | null = null;
    if (delivered >= ordered && ordered > 0) {
      nextStatus = 'fulfilled';
    } else if (delivered > 0) {
      nextStatus = 'partially_delivered';
    }
    if (nextStatus && nextStatus !== si.fulfillment_status) {
      await trx('sale_items')
        .where({ id: si.id, dealer_id: dealerId })
        .update({ fulfillment_status: nextStatus });
    }
  }

  let newSaleStatus: string | null = null;
  if (totalDelivered >= totalOrdered && totalOrdered > 0) {
    newSaleStatus = 'delivered';
  } else if (totalDelivered > 0) {
    newSaleStatus = 'partially_delivered';
  }
  if (newSaleStatus) {
    await trx('sales')
      .where({ id: saleId, dealer_id: dealerId })
      .update({ sale_status: newSaleStatus });
  }

  return newSaleStatus;
}

/**
 * Best-effort: promote commission to "earned" once a sale becomes fully
 * delivered. Implemented as a thin SQL helper call; absence of the helper
 * just means commission promotion is skipped (matches Supabase service).
 */
async function tryPromoteCommission(trx: any, saleId: string, dealerId: string) {
  try {
    await trx.raw(
      `select promote_commission_to_earned_if_fully_delivered(?::uuid, ?::uuid)`,
      [saleId, dealerId],
    );
  } catch (e) {
    // Non-fatal: commission promotion helper may not exist yet.
    console.warn('[deliveries] commission promotion skipped:', (e as any)?.message);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/deliveries
// ────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  dealer_id: z.string().uuid().optional(),
  challan_id: z.string().uuid().nullable().optional(),
  sale_id: z.string().uuid().nullable().optional(),
  delivery_date: z.string().min(1),
  receiver_name: z.string().nullable().optional(),
  receiver_phone: z.string().nullable().optional(),
  delivery_address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        sale_item_id: z.string().uuid(),
        product_id: z.string().uuid(),
        quantity: z.coerce.number().positive(),
      }),
    )
    .optional(),
});

router.post('/', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
    return;
  }
  const input = parsed.data;
  const userId = req.user?.userId ?? null;
  const { ip, ua } = clientMeta(req);

  try {
    const deliveryId = await db.transaction(async (trx) => {
      // ----- Server-side over-delivery guard -----
      if (input.sale_id && input.items && input.items.length > 0) {
        const saleItems = await trx('sale_items')
          .where({ sale_id: input.sale_id, dealer_id: dealerId })
          .select('id', 'quantity');
        const orderedById = new Map<string, number>();
        for (const si of saleItems) orderedById.set(si.id, Number(si.quantity));

        // Existing delivered totals
        const priorDeliveries = await trx('deliveries')
          .where({ sale_id: input.sale_id, dealer_id: dealerId })
          .select('id');
        const priorIds = priorDeliveries.map((d: any) => d.id);
        const alreadyDelivered: Record<string, number> = {};
        if (priorIds.length > 0) {
          const priorItems = await trx('delivery_items')
            .whereIn('delivery_id', priorIds)
            .select('sale_item_id', 'quantity');
          for (const it of priorItems) {
            alreadyDelivered[it.sale_item_id] =
              (alreadyDelivered[it.sale_item_id] || 0) + Number(it.quantity);
          }
        }

        for (const item of input.items) {
          const ordered = orderedById.get(item.sale_item_id);
          if (ordered === undefined) {
            throw new Error('Delivery item does not belong to the referenced sale.');
          }
          const prior = alreadyDelivered[item.sale_item_id] || 0;
          const remaining = Math.max(0, ordered - prior);
          if (Number(item.quantity) > remaining + 1e-9) {
            throw new Error(
              `Cannot deliver ${item.quantity} — only ${remaining} remaining for this line (ordered ${ordered}, already delivered ${prior}).`,
            );
          }
        }
      }

      const deliveryNo = await generateDeliveryNo(trx, dealerId);

      // Inherit project/site from sale, else challan
      let projectId: string | null = null;
      let siteId: string | null = null;
      if (input.sale_id) {
        const s = await trx('sales')
          .where({ id: input.sale_id, dealer_id: dealerId })
          .first('project_id', 'site_id');
        projectId = s?.project_id ?? null;
        siteId = s?.site_id ?? null;
      }
      if (!projectId && input.challan_id) {
        const c = await trx('challans')
          .where({ id: input.challan_id, dealer_id: dealerId })
          .first('project_id', 'site_id');
        projectId = c?.project_id ?? null;
        siteId = c?.site_id ?? null;
      }

      let resolvedAddress = input.delivery_address || null;
      if (!resolvedAddress && siteId) {
        const site = await trx('project_sites')
          .where({ id: siteId, dealer_id: dealerId })
          .first('address');
        resolvedAddress = site?.address ?? null;
      }

      const [header] = await trx('deliveries')
        .insert({
          dealer_id: dealerId,
          challan_id: input.challan_id || null,
          sale_id: input.sale_id || null,
          delivery_date: input.delivery_date,
          status: 'pending',
          receiver_name: input.receiver_name || null,
          receiver_phone: input.receiver_phone || null,
          delivery_address: resolvedAddress,
          notes: input.notes || null,
          created_by: userId,
          delivery_no: deliveryNo,
          project_id: projectId,
          site_id: siteId,
        })
        .returning('id');
      const did = header.id;

      // Insert items
      let insertedAny = false;
      if (input.items && input.items.length > 0) {
        const itemRows = input.items
          .filter((i) => Number(i.quantity) > 0)
          .map((i) => ({
            delivery_id: did,
            sale_item_id: i.sale_item_id,
            product_id: i.product_id,
            dealer_id: dealerId,
            quantity: i.quantity,
          }));
        if (itemRows.length > 0) {
          await trx('delivery_items').insert(itemRows);
          insertedAny = true;
        }
      }

      // Best-effort batch tracking via existing RPC (function may not exist).
      if (insertedAny) {
        try {
          await trx.raw(
            `select execute_delivery_batches(?::uuid, ?::uuid)`,
            [did, dealerId],
          );
        } catch (e) {
          console.warn('[deliveries] batch tracking skipped:', (e as any)?.message);
        }
      }

      // Refresh sale-level + per-line fulfillment status
      let promotedSaleStatus: string | null = null;
      if (input.sale_id) {
        promotedSaleStatus = await syncSaleDeliveryStatus(trx, input.sale_id, dealerId);
        if (promotedSaleStatus === 'delivered') {
          await tryPromoteCommission(trx, input.sale_id, dealerId);
        }
      }

      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: userId,
        action: 'delivery_create',
        table_name: 'deliveries',
        record_id: did,
        new_data: {
          delivery_no: deliveryNo,
          sale_id: input.sale_id || null,
          challan_id: input.challan_id || null,
          item_count: input.items?.length ?? 0,
          promoted_sale_status: promotedSaleStatus,
        },
        ip_address: ip,
        user_agent: ua,
      });

      return did;
    });

    const created = await db('deliveries').where({ id: deliveryId }).first();
    res.status(201).json(created);
  } catch (err: any) {
    console.error('[deliveries.create] error', err);
    res.status(500).json({ error: err?.message || 'Failed to create delivery' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/deliveries/:id/status
// ────────────────────────────────────────────────────────────────────────────

const statusSchema = z.object({
  status: z.string().min(1),
  dealer_id: z.string().uuid().optional(),
});

router.patch('/:id/status', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;

  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
    return;
  }
  const { status } = parsed.data;
  const userId = req.user?.userId ?? null;
  const { ip, ua } = clientMeta(req);
  const id = req.params.id;

  try {
    await db.transaction(async (trx) => {
      const existing = await trx('deliveries')
        .where({ id, dealer_id: dealerId })
        .first('id');
      if (!existing) throw new Error('Delivery not found');

      await trx('deliveries').where({ id }).update({ status });

      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: userId,
        action: 'delivery_status_update',
        table_name: 'deliveries',
        record_id: id,
        new_data: { status },
        ip_address: ip,
        user_agent: ua,
      });
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[deliveries.status] error', err);
    res.status(500).json({ error: err?.message || 'Failed to update delivery status' });
  }
});

export default router;
