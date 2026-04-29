/**
 * Challans routes — Phase 3O.
 *
 *   POST   /api/challans                          ← create challan + reserve stock
 *   POST   /api/challans/:id/deliver              ← mark delivered (no ledger)
 *   POST   /api/challans/convert-invoice/:saleId  ← deduct reserved + ledger
 *   PUT    /api/challans/:id                      ← edit details + items (re-reserve)
 *   POST   /api/challans/:id/cancel               ← cancel + unreserve
 *   PATCH  /api/challans/:id/delivery-status      ← update delivery_status
 *
 * Stock helpers (reserve / unreserve / deduct-reserved) mirror the legacy
 * stockService and operate on the aggregate `stock` row inside the txn.
 *
 * Reads stay on Supabase for now (Phase 3O is mutations-only).
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
    res.status(403).json({ error: 'Only dealer_admin can manage challans' });
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

// ────────────────────────────────────────────────────────────────────────────
// Stock helpers (transaction-bound, mirror stockService)
// ────────────────────────────────────────────────────────────────────────────

async function getOrCreateStockTrx(trx: any, productId: string, dealerId: string) {
  let stock = await trx('stock')
    .where({ product_id: productId, dealer_id: dealerId })
    .forUpdate()
    .first();
  if (!stock) {
    const [row] = await trx('stock')
      .insert({ product_id: productId, dealer_id: dealerId })
      .returning('*');
    stock = row;
  }
  return stock;
}

async function reserveStockTrx(
  trx: any,
  productId: string,
  quantity: number,
  dealerId: string,
) {
  if (quantity <= 0) throw new Error('Quantity must be positive');
  const product = await trx('products')
    .where({ id: productId, dealer_id: dealerId })
    .first('id', 'unit_type', 'per_box_sft');
  if (!product) throw new Error(`Product not found: ${productId}`);
  const stock = await getOrCreateStockTrx(trx, productId, dealerId);

  if (product.unit_type === 'box_sft') {
    const available = Number(stock.box_qty) - Number(stock.reserved_box_qty ?? 0);
    if (quantity > available)
      throw new Error(`Insufficient available box stock (available: ${available})`);
    await trx('stock').where({ id: stock.id }).update({
      box_qty: Number(stock.box_qty) - quantity,
      sft_qty: (Number(stock.box_qty) - quantity) * Number(product.per_box_sft ?? 0),
      reserved_box_qty: Number(stock.reserved_box_qty ?? 0) + quantity,
    });
  } else {
    const available = Number(stock.piece_qty) - Number(stock.reserved_piece_qty ?? 0);
    if (quantity > available)
      throw new Error(`Insufficient available piece stock (available: ${available})`);
    await trx('stock').where({ id: stock.id }).update({
      piece_qty: Number(stock.piece_qty) - quantity,
      reserved_piece_qty: Number(stock.reserved_piece_qty ?? 0) + quantity,
    });
  }

  await trx('audit_logs').insert({
    dealer_id: dealerId,
    action: 'stock_reserve',
    table_name: 'stock',
    record_id: stock.id,
    new_data: { product_id: productId, quantity, type: 'reserve' },
  });
}

async function unreserveStockTrx(
  trx: any,
  productId: string,
  quantity: number,
  dealerId: string,
) {
  if (quantity <= 0) throw new Error('Quantity must be positive');
  const product = await trx('products')
    .where({ id: productId, dealer_id: dealerId })
    .first('id', 'unit_type', 'per_box_sft');
  if (!product) throw new Error(`Product not found: ${productId}`);
  const stock = await getOrCreateStockTrx(trx, productId, dealerId);

  if (product.unit_type === 'box_sft') {
    await trx('stock').where({ id: stock.id }).update({
      box_qty: Number(stock.box_qty) + quantity,
      sft_qty: (Number(stock.box_qty) + quantity) * Number(product.per_box_sft ?? 0),
      reserved_box_qty: Math.max(0, Number(stock.reserved_box_qty ?? 0) - quantity),
    });
  } else {
    await trx('stock').where({ id: stock.id }).update({
      piece_qty: Number(stock.piece_qty) + quantity,
      reserved_piece_qty: Math.max(0, Number(stock.reserved_piece_qty ?? 0) - quantity),
    });
  }

  await trx('audit_logs').insert({
    dealer_id: dealerId,
    action: 'stock_unreserve',
    table_name: 'stock',
    record_id: stock.id,
    new_data: { product_id: productId, quantity, type: 'unreserve' },
  });
}

async function deductReservedStockTrx(
  trx: any,
  productId: string,
  quantity: number,
  dealerId: string,
) {
  if (quantity <= 0) throw new Error('Quantity must be positive');
  const product = await trx('products')
    .where({ id: productId, dealer_id: dealerId })
    .first('id', 'unit_type');
  if (!product) throw new Error(`Product not found: ${productId}`);
  const stock = await getOrCreateStockTrx(trx, productId, dealerId);

  if (product.unit_type === 'box_sft') {
    await trx('stock').where({ id: stock.id }).update({
      reserved_box_qty: Math.max(0, Number(stock.reserved_box_qty ?? 0) - quantity),
    });
  } else {
    await trx('stock').where({ id: stock.id }).update({
      reserved_piece_qty: Math.max(0, Number(stock.reserved_piece_qty ?? 0) - quantity),
    });
  }

  await trx('audit_logs').insert({
    dealer_id: dealerId,
    action: 'stock_deduct_reserved',
    table_name: 'stock',
    record_id: stock.id,
    new_data: { product_id: productId, quantity, type: 'deduct_reserved' },
  });
}

async function generateChallanNo(trx: any, dealerId: string): Promise<string> {
  try {
    const r = await trx.raw(`select generate_next_challan_no(?::uuid) as v`, [dealerId]);
    const v = r?.rows?.[0]?.v;
    if (v) return v as string;
  } catch {
    // fall through to count-based fallback
  }
  const row = await trx('challans')
    .where({ dealer_id: dealerId })
    .count<{ count: string }[]>('id as count');
  const next = Number(row?.[0]?.count ?? 0) + 1;
  return `CH-${String(next).padStart(5, '0')}`;
}

async function tryPromoteCommission(trx: any, saleId: string, dealerId: string) {
  try {
    await trx.raw(
      `select promote_commission_to_earned_if_fully_delivered(?::uuid, ?::uuid)`,
      [saleId, dealerId],
    );
  } catch (e) {
    console.warn('[challans] commission promotion skipped:', (e as any)?.message);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/challans  — create + reserve
// ────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  dealer_id: z.string().uuid().optional(),
  sale_id: z.string().uuid(),
  challan_date: z.string().min(1),
  driver_name: z.string().nullable().optional(),
  transport_name: z.string().nullable().optional(),
  vehicle_no: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  show_price: z.boolean().optional(),
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
    const challanId = await db.transaction(async (trx) => {
      const sale = await trx('sales')
        .where({ id: input.sale_id, dealer_id: dealerId })
        .first('id', 'sale_type', 'sale_status', 'project_id', 'site_id');
      if (!sale) throw new Error('Sale not found');
      if (sale.sale_type !== 'challan_mode')
        throw new Error('Sale is not in challan mode');
      if (sale.sale_status !== 'draft')
        throw new Error('Challan already created for this sale');

      const items = await trx('sale_items')
        .where({ sale_id: input.sale_id, dealer_id: dealerId })
        .select('product_id', 'quantity');

      // Reserve stock for each line
      for (const it of items) {
        await reserveStockTrx(trx, it.product_id, Number(it.quantity), dealerId);
      }

      const challanNo = await generateChallanNo(trx, dealerId);

      const [header] = await trx('challans')
        .insert({
          dealer_id: dealerId,
          sale_id: input.sale_id,
          challan_no: challanNo,
          challan_date: input.challan_date,
          driver_name: input.driver_name || null,
          transport_name: input.transport_name || null,
          vehicle_no: input.vehicle_no || null,
          notes: input.notes || null,
          status: 'pending',
          delivery_status: 'pending',
          created_by: userId,
          show_price: input.show_price ?? false,
          project_id: sale.project_id ?? null,
          site_id: sale.site_id ?? null,
        })
        .returning('id');
      const cid = header.id;

      await trx('sales')
        .where({ id: input.sale_id, dealer_id: dealerId })
        .update({ sale_status: 'challan_created' });

      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: userId,
        action: 'challan_create',
        table_name: 'challans',
        record_id: cid,
        new_data: { challan_no: challanNo, sale_id: input.sale_id },
        ip_address: ip,
        user_agent: ua,
      });

      return cid;
    });

    const created = await db('challans').where({ id: challanId }).first();
    res.status(201).json(created);
  } catch (err: any) {
    console.error('[challans.create] error', err);
    res.status(500).json({ error: err?.message || 'Failed to create challan' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/challans/:id/deliver
// ────────────────────────────────────────────────────────────────────────────

router.post('/:id/deliver', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const id = req.params.id;
  const userId = req.user?.userId ?? null;
  const { ip, ua } = clientMeta(req);

  try {
    await db.transaction(async (trx) => {
      const challan = await trx('challans')
        .where({ id, dealer_id: dealerId })
        .first('id', 'status', 'sale_id');
      if (!challan) throw new Error('Challan not found');
      if (challan.status !== 'pending') throw new Error('Challan is not pending');

      await trx('challans').where({ id }).update({ status: 'delivered' });
      await trx('sales')
        .where({ id: challan.sale_id, dealer_id: dealerId })
        .update({ sale_status: 'delivered' });

      await tryPromoteCommission(trx, challan.sale_id, dealerId);

      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: userId,
        action: 'challan_delivered',
        table_name: 'challans',
        record_id: id,
        ip_address: ip,
        user_agent: ua,
      });
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[challans.deliver] error', err);
    res.status(500).json({ error: err?.message || 'Failed to mark delivered' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/challans/convert-invoice/:saleId
// ────────────────────────────────────────────────────────────────────────────

router.post('/convert-invoice/:saleId', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const saleId = req.params.saleId;
  const userId = req.user?.userId ?? null;
  const { ip, ua } = clientMeta(req);

  try {
    await db.transaction(async (trx) => {
      const sale = await trx('sales')
        .where({ id: saleId, dealer_id: dealerId })
        .first(
          'id',
          'invoice_number',
          'sale_status',
          'customer_id',
          'sale_date',
          'total_amount',
          'paid_amount',
        );
      if (!sale) throw new Error('Sale not found');
      if (sale.sale_status !== 'delivered' && sale.sale_status !== 'challan_created') {
        throw new Error('Sale must be delivered or challan_created to convert to invoice');
      }

      const items = await trx('sale_items')
        .where({ sale_id: saleId, dealer_id: dealerId })
        .select('product_id', 'quantity');

      for (const it of items) {
        await deductReservedStockTrx(trx, it.product_id, Number(it.quantity), dealerId);
      }

      // Customer ledger — sale entry
      await trx('customer_ledger').insert({
        dealer_id: dealerId,
        customer_id: sale.customer_id,
        sale_id: saleId,
        type: 'sale',
        amount: Number(sale.total_amount),
        description: `Sale ${sale.invoice_number}`,
        entry_date: sale.sale_date,
      });

      if (Number(sale.paid_amount) > 0) {
        await trx('customer_ledger').insert({
          dealer_id: dealerId,
          customer_id: sale.customer_id,
          sale_id: saleId,
          type: 'payment',
          amount: -Number(sale.paid_amount),
          description: `Payment received for ${sale.invoice_number}`,
          entry_date: sale.sale_date,
        });
        await trx('cash_ledger').insert({
          dealer_id: dealerId,
          type: 'receipt',
          amount: Number(sale.paid_amount),
          description: `Payment received: ${sale.invoice_number}`,
          reference_type: 'sales',
          reference_id: saleId,
          entry_date: sale.sale_date,
        });
      }

      await trx('sales')
        .where({ id: saleId, dealer_id: dealerId })
        .update({ sale_status: 'invoiced' });

      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: userId,
        action: 'challan_convert_invoice',
        table_name: 'sales',
        record_id: saleId,
        ip_address: ip,
        user_agent: ua,
      });
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[challans.convertInvoice] error', err);
    res.status(500).json({ error: err?.message || 'Failed to convert challan to invoice' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/challans/:id  — update details + (optional) re-quantify items
// ────────────────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  dealer_id: z.string().uuid().optional(),
  challan_date: z.string().optional(),
  driver_name: z.string().nullable().optional(),
  transport_name: z.string().nullable().optional(),
  vehicle_no: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        product_id: z.string().uuid(),
        quantity: z.coerce.number().nonnegative(),
        sale_rate: z.coerce.number().nonnegative(),
      }),
    )
    .optional(),
});

router.put('/:id', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const id = req.params.id;

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
    return;
  }
  const updates = parsed.data;
  const userId = req.user?.userId ?? null;
  const { ip, ua } = clientMeta(req);

  try {
    await db.transaction(async (trx) => {
      const challan = await trx('challans')
        .where({ id, dealer_id: dealerId })
        .first('id', 'status', 'sale_id');
      if (!challan) throw new Error('Challan not found');
      if (challan.status === 'cancelled') throw new Error('Cannot edit a cancelled challan');

      await trx('challans').where({ id }).update({
        challan_date: updates.challan_date,
        driver_name: updates.driver_name || null,
        transport_name: updates.transport_name || null,
        vehicle_no: updates.vehicle_no || null,
        notes: updates.notes || null,
      });

      if (updates.items && updates.items.length > 0) {
        const saleId = challan.sale_id;
        const productIds = updates.items.map((i) => i.product_id);
        const products = await trx('products')
          .whereIn('id', productIds)
          .andWhere({ dealer_id: dealerId })
          .select('id', 'unit_type', 'per_box_sft');
        const productMap = new Map(products.map((p: any) => [p.id, p]));

        const oldItems = await trx('sale_items')
          .where({ sale_id: saleId, dealer_id: dealerId })
          .select('product_id', 'quantity');

        // Unreserve old stock
        for (const oi of oldItems) {
          await unreserveStockTrx(trx, oi.product_id, Number(oi.quantity), dealerId);
        }

        let totalBox = 0;
        let totalSft = 0;
        let totalPiece = 0;

        for (const item of updates.items) {
          const product: any = productMap.get(item.product_id);
          const unitType = product?.unit_type ?? 'piece';
          const perBoxSft = Number(product?.per_box_sft ?? 0);
          let itemTotal: number;
          let itemSft: number | null = null;

          if (unitType === 'box_sft') {
            totalBox += item.quantity;
            itemSft = item.quantity * perBoxSft;
            totalSft += itemSft;
            itemTotal = itemSft * item.sale_rate;
          } else {
            totalPiece += item.quantity;
            itemTotal = item.quantity * item.sale_rate;
          }

          await trx('sale_items')
            .where({ id: item.id, dealer_id: dealerId })
            .update({
              quantity: item.quantity,
              sale_rate: item.sale_rate,
              total: itemTotal,
              total_sft: itemSft,
            });
        }

        // Re-reserve new quantities
        for (const item of updates.items) {
          if (item.quantity > 0) {
            await reserveStockTrx(trx, item.product_id, item.quantity, dealerId);
          }
        }

        // Recalc totals
        const updated = await trx('sale_items')
          .where({ sale_id: saleId, dealer_id: dealerId })
          .sum<{ sum: string }[]>('total as sum');
        const subtotal = Number(updated?.[0]?.sum ?? 0);

        const saleData = await trx('sales')
          .where({ id: saleId, dealer_id: dealerId })
          .first('discount', 'paid_amount');
        const discount = Number(saleData?.discount ?? 0);
        const paidAmount = Number(saleData?.paid_amount ?? 0);
        const totalAmount = subtotal - discount;
        const dueAmount = totalAmount - paidAmount;

        await trx('sales').where({ id: saleId, dealer_id: dealerId }).update({
          total_amount: totalAmount,
          due_amount: dueAmount,
          total_box: totalBox,
          total_sft: totalSft,
          total_piece: totalPiece,
        });
      }

      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: userId,
        action: 'challan_update',
        table_name: 'challans',
        record_id: id,
        new_data: updates as any,
        ip_address: ip,
        user_agent: ua,
      });
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[challans.update] error', err);
    res.status(500).json({ error: err?.message || 'Failed to update challan' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/challans/:id/cancel
// ────────────────────────────────────────────────────────────────────────────

router.post('/:id/cancel', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const id = req.params.id;
  const userId = req.user?.userId ?? null;
  const { ip, ua } = clientMeta(req);

  try {
    await db.transaction(async (trx) => {
      const challan = await trx('challans')
        .where({ id, dealer_id: dealerId })
        .first('id', 'status', 'delivery_status', 'sale_id');
      if (!challan) throw new Error('Challan not found');
      if (challan.delivery_status === 'delivered') {
        throw new Error('Cannot cancel a challan that has been delivered');
      }
      if (challan.status !== 'pending' && challan.status !== 'delivered') {
        throw new Error('Cannot cancel this challan');
      }

      const items = await trx('sale_items')
        .where({ sale_id: challan.sale_id, dealer_id: dealerId })
        .select('product_id', 'quantity');

      for (const it of items) {
        await unreserveStockTrx(trx, it.product_id, Number(it.quantity), dealerId);
      }

      await trx('challans').where({ id }).update({ status: 'cancelled' });
      await trx('sales')
        .where({ id: challan.sale_id, dealer_id: dealerId })
        .update({ sale_status: 'draft' });

      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: userId,
        action: 'challan_cancel',
        table_name: 'challans',
        record_id: id,
        ip_address: ip,
        user_agent: ua,
      });
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[challans.cancel] error', err);
    res.status(500).json({ error: err?.message || 'Failed to cancel challan' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/challans/:id/delivery-status
// ────────────────────────────────────────────────────────────────────────────

const deliveryStatusSchema = z.object({
  delivery_status: z.string().min(1),
  dealer_id: z.string().uuid().optional(),
});

router.patch('/:id/delivery-status', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const id = req.params.id;

  const parsed = deliveryStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
    return;
  }
  const newStatus = parsed.data.delivery_status;
  const userId = req.user?.userId ?? null;
  const { ip, ua } = clientMeta(req);

  try {
    await db.transaction(async (trx) => {
      const challan = await trx('challans')
        .where({ id, dealer_id: dealerId })
        .first('id', 'status', 'sale_id');
      if (!challan) throw new Error('Challan not found');
      if (challan.status === 'cancelled')
        throw new Error('Cannot update a cancelled challan');

      await trx('challans').where({ id }).update({ delivery_status: newStatus });

      if (newStatus === 'delivered') {
        await trx('sales')
          .where({ id: challan.sale_id, dealer_id: dealerId })
          .update({ sale_status: 'delivered' });
        await tryPromoteCommission(trx, challan.sale_id, dealerId);
      }

      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: userId,
        action: 'challan_delivery_status_update',
        table_name: 'challans',
        record_id: id,
        new_data: { delivery_status: newStatus },
        ip_address: ip,
        user_agent: ua,
      });
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[challans.deliveryStatus] error', err);
    res.status(500).json({ error: err?.message || 'Failed to update delivery status' });
  }
});

export default router;
