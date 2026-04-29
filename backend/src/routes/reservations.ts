/**
 * Stock reservations route — Phase 3R.
 *
 *   GET  /api/reservations?dealerId=&status=&product_id=&customer_id=
 *   GET  /api/reservations/by-customer-product?customerId=&productId=
 *   GET  /api/reservations/by-product/:productId
 *   POST /api/reservations                            ← create (calls RPC)
 *   POST /api/reservations/:id/release                ← release (calls RPC)
 *   POST /api/reservations/:id/extend                 ← extend expiry
 *   POST /api/reservations/:id/consume                ← consume during sale
 *   POST /api/reservations/expire-stale               ← bulk expire stale
 *
 * Mutations call the existing PL/pgSQL RPCs (create_stock_reservation,
 * release_stock_reservation, consume_reservation_for_sale,
 * expire_stale_reservations) so atomicity matches Supabase exactly.
 *
 * dealer_admin OR salesman can read; only dealer_admin can release/extend.
 * Create is allowed for both (POS/Sale flows need to reserve).
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
    res.status(403).json({ error: 'Only dealer_admin can perform this action' });
    return false;
  }
  return true;
}

// ── GET /api/reservations ──
router.get('/', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  try {
    let q = db('stock_reservations as sr')
      .leftJoin('products as p', 'p.id', 'sr.product_id')
      .leftJoin('customers as c', 'c.id', 'sr.customer_id')
      .leftJoin('product_batches as pb', 'pb.id', 'sr.batch_id')
      .where({ 'sr.dealer_id': dealerId })
      .select(
        'sr.*',
        'p.name as product_name',
        'p.sku as product_sku',
        'p.unit_type as product_unit_type',
        'p.category as product_category',
        'c.name as customer_name',
        'pb.batch_no as batch_no',
        'pb.shade_code as batch_shade_code',
        'pb.caliber as batch_caliber',
      )
      .orderBy('sr.created_at', 'desc');

    const status = req.query.status as string | undefined;
    if (status) q = q.andWhere('sr.status', status);
    const productId = req.query.product_id as string | undefined;
    if (productId) q = q.andWhere('sr.product_id', productId);
    const customerId = req.query.customer_id as string | undefined;
    if (customerId) q = q.andWhere('sr.customer_id', customerId);

    const rows = await q;
    res.json({
      rows: rows.map((r: any) => ({
        ...r,
        products: {
          name: r.product_name,
          sku: r.product_sku,
          unit_type: r.product_unit_type,
          category: r.product_category,
        },
        customers: { name: r.customer_name },
        product_batches: r.batch_no
          ? { batch_no: r.batch_no, shade_code: r.batch_shade_code, caliber: r.batch_caliber }
          : null,
      })),
    });
  } catch (err: any) {
    console.error('[reservations/list]', err.message);
    res.status(500).json({ error: 'Failed to list reservations' });
  }
});

// ── GET /api/reservations/by-customer-product ──
router.get('/by-customer-product', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const customerId = req.query.customerId as string | undefined;
  const productId = req.query.productId as string | undefined;
  if (!customerId || !productId) {
    res.status(400).json({ error: 'customerId and productId are required' });
    return;
  }
  try {
    const rows = await db('stock_reservations as sr')
      .leftJoin('product_batches as pb', 'pb.id', 'sr.batch_id')
      .where({
        'sr.dealer_id': dealerId,
        'sr.customer_id': customerId,
        'sr.product_id': productId,
        'sr.status': 'active',
      })
      .select(
        'sr.*',
        'pb.batch_no as batch_no',
        'pb.shade_code as batch_shade_code',
        'pb.caliber as batch_caliber',
      )
      .orderBy('sr.created_at', 'asc');
    res.json({
      rows: rows.map((r: any) => ({
        ...r,
        product_batches: r.batch_no
          ? { batch_no: r.batch_no, shade_code: r.batch_shade_code, caliber: r.batch_caliber }
          : null,
      })),
    });
  } catch (err: any) {
    console.error('[reservations/by-customer-product]', err.message);
    res.status(500).json({ error: 'Failed to load reservations' });
  }
});

// ── GET /api/reservations/by-product/:productId ──
router.get('/by-product/:productId', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  try {
    const rows = await db('stock_reservations as sr')
      .leftJoin('customers as c', 'c.id', 'sr.customer_id')
      .leftJoin('product_batches as pb', 'pb.id', 'sr.batch_id')
      .where({
        'sr.dealer_id': dealerId,
        'sr.product_id': req.params.productId,
        'sr.status': 'active',
      })
      .select(
        'sr.*',
        'c.name as customer_name',
        'pb.batch_no as batch_no',
        'pb.shade_code as batch_shade_code',
        'pb.caliber as batch_caliber',
      )
      .orderBy('sr.created_at', 'asc');
    res.json({
      rows: rows.map((r: any) => ({
        ...r,
        customers: { name: r.customer_name },
        product_batches: r.batch_no
          ? { batch_no: r.batch_no, shade_code: r.batch_shade_code, caliber: r.batch_caliber }
          : null,
      })),
    });
  } catch (err: any) {
    console.error('[reservations/by-product]', err.message);
    res.status(500).json({ error: 'Failed to load reservations' });
  }
});

// ── POST /api/reservations ──
const CreateSchema = z.object({
  product_id: z.string().uuid(),
  batch_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid(),
  reserved_qty: z.coerce.number().positive(),
  unit_type: z.enum(['box_sft', 'piece']),
  reason: z.string().optional().nullable(),
  expires_at: z.string().nullable().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  const p = parsed.data;
  try {
    const result = await db.transaction(async (trx) => {
      const r = await trx.raw(
        `select create_stock_reservation(
           ?::uuid, ?::uuid, ?::uuid, ?::uuid, ?::numeric, ?::text, ?::text, ?::timestamptz, ?::uuid
         ) as id`,
        [
          dealerId,
          p.product_id,
          p.batch_id ?? null,
          p.customer_id,
          p.reserved_qty,
          p.unit_type,
          p.reason ?? null,
          p.expires_at ?? null,
          req.user?.userId ?? null,
        ],
      );
      const id = r?.rows?.[0]?.id as string;

      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: req.user?.userId ?? null,
        action: 'RESERVATION_CREATED',
        table_name: 'stock_reservations',
        record_id: id,
        new_data: {
          product_id: p.product_id,
          batch_id: p.batch_id ?? null,
          customer_id: p.customer_id,
          reserved_qty: p.reserved_qty,
          reason: p.reason ?? null,
        },
      });

      return id;
    });
    res.status(201).json({ id: result });
  } catch (err: any) {
    console.error('[reservations/create]', err.message);
    res.status(400).json({ error: err.message || 'Failed to create reservation' });
  }
});

// ── POST /api/reservations/:id/release ──
router.post('/:id/release', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireAdmin(req, res)) return;
  const reason = String(req.body?.release_reason ?? '').trim();
  if (!reason) {
    res.status(400).json({ error: 'release_reason is required' });
    return;
  }
  try {
    await db.transaction(async (trx) => {
      await trx.raw(
        `select release_stock_reservation(?::uuid, ?::uuid, ?::text)`,
        [req.params.id, dealerId, reason],
      );
      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: req.user?.userId ?? null,
        action: 'RESERVATION_RELEASED',
        table_name: 'stock_reservations',
        record_id: req.params.id,
        new_data: { release_reason: reason },
      });
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[reservations/release]', err.message);
    res.status(400).json({ error: err.message || 'Failed to release reservation' });
  }
});

// ── POST /api/reservations/:id/extend ──
router.post('/:id/extend', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireAdmin(req, res)) return;
  const Schema = z.object({
    expires_at: z.string().min(1),
    reason: z.string().min(1),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    await db.transaction(async (trx) => {
      const old = await trx('stock_reservations')
        .where({ id: req.params.id, dealer_id: dealerId })
        .first('expires_at', 'status');
      if (!old) throw new Error('Reservation not found');
      if (old.status !== 'active') throw new Error('Only active reservations can be extended');

      const updated = await trx('stock_reservations')
        .where({ id: req.params.id, dealer_id: dealerId, status: 'active' })
        .update({ expires_at: parsed.data.expires_at });
      if (!updated) throw new Error('Update failed (possibly status changed)');

      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: req.user?.userId ?? null,
        action: 'RESERVATION_EXTENDED',
        table_name: 'stock_reservations',
        record_id: req.params.id,
        old_data: { expires_at: old.expires_at },
        new_data: { expires_at: parsed.data.expires_at, reason: parsed.data.reason },
      });
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[reservations/extend]', err.message);
    res.status(400).json({ error: err.message || 'Failed to extend reservation' });
  }
});

// ── POST /api/reservations/:id/consume ──
router.post('/:id/consume', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  const Schema = z.object({
    sale_item_id: z.string().uuid(),
    consume_qty: z.coerce.number().positive(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    await db.transaction(async (trx) => {
      await trx.raw(
        `select consume_reservation_for_sale(?::uuid, ?::uuid, ?::uuid, ?::numeric)`,
        [req.params.id, dealerId, parsed.data.sale_item_id, parsed.data.consume_qty],
      );
      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: req.user?.userId ?? null,
        action: 'RESERVATION_CONSUMED',
        table_name: 'stock_reservations',
        record_id: req.params.id,
        new_data: {
          sale_item_id: parsed.data.sale_item_id,
          consumed_qty: parsed.data.consume_qty,
        },
      });
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[reservations/consume]', err.message);
    res.status(400).json({ error: err.message || 'Failed to consume reservation' });
  }
});

// ── POST /api/reservations/expire-stale ──
router.post('/expire-stale', async (req: Request, res: Response) => {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  try {
    const r = await db.raw(`select expire_stale_reservations(?::uuid) as n`, [dealerId]);
    const n = Number(r?.rows?.[0]?.n ?? 0);
    res.json({ expired: n });
  } catch (err: any) {
    console.error('[reservations/expire-stale]', err.message);
    res.status(500).json({ error: err.message || 'Failed to expire reservations' });
  }
});

export default router;
