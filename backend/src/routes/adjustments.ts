/**
 * Stock adjustments route — Phase 3R.
 *
 * Manual stock add / deduct / restore / broken endpoints. Each call writes
 * an audit_log row inside a transaction, so the operation is atomic and
 * tamper-evident.
 *
 *   POST /api/adjustments/add     { product_id, quantity }
 *   POST /api/adjustments/deduct  { product_id, quantity }
 *   POST /api/adjustments/restore { product_id, quantity }
 *   POST /api/adjustments/broken  { product_id, quantity, reason }
 *
 * dealer_admin only.
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
    res.status(403).json({ error: 'Only dealer_admin can adjust stock' });
    return false;
  }
  return true;
}

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

type AdjType = 'add' | 'deduct' | 'restore' | 'broken';

async function applyChange(
  type: AdjType,
  req: Request,
  res: Response,
  extra: { reason?: string } = {},
) {
  const dealerId = resolveDealer(req, res);
  if (!dealerId) return;
  if (!requireAdmin(req, res)) return;

  const Schema = z.object({
    product_id: z.string().uuid(),
    quantity: z.coerce.number().positive(),
    reason: z.string().optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  const { product_id, quantity } = parsed.data;
  const reason = extra.reason ?? parsed.data.reason ?? null;

  try {
    await db.transaction(async (trx) => {
      const product = await trx('products')
        .where({ id: product_id, dealer_id: dealerId })
        .first('id', 'unit_type', 'per_box_sft');
      if (!product) throw new Error(`Product not found: ${product_id}`);

      const stock = await getOrCreateStockTrx(trx, product_id, dealerId);

      const sign = type === 'deduct' || type === 'broken' ? -1 : 1;
      const updates: Record<string, number> = {};

      if (product.unit_type === 'box_sft') {
        const perBoxSft = Number(product.per_box_sft ?? 0);
        const newBox = Number(stock.box_qty) + sign * quantity;
        if (newBox < 0) throw new Error('Insufficient box stock');
        updates.box_qty = Math.max(0, newBox);
        updates.sft_qty = Math.max(0, newBox) * perBoxSft;
      } else {
        const newPiece = Number(stock.piece_qty) + sign * quantity;
        if (newPiece < 0) throw new Error('Insufficient piece stock');
        updates.piece_qty = Math.max(0, newPiece);
      }

      await trx('stock').where({ id: stock.id }).update(updates);

      await trx('audit_logs').insert({
        dealer_id: dealerId,
        user_id: req.user?.userId ?? null,
        action: type === 'broken' ? 'stock_broken' : `stock_${type}`,
        table_name: 'stock',
        record_id: stock.id,
        old_data: {
          box_qty: stock.box_qty,
          sft_qty: stock.sft_qty,
          piece_qty: stock.piece_qty,
        },
        new_data: {
          ...updates,
          adjustment_type: type,
          quantity,
          ...(reason ? { reason } : {}),
        },
      });
    });

    res.json({ ok: true });
  } catch (err: any) {
    console.error(`[adjustments/${type}]`, err.message);
    res.status(400).json({ error: err.message || 'Stock adjustment failed' });
  }
}

router.post('/add', (req, res) => applyChange('add', req, res));
router.post('/deduct', (req, res) => applyChange('deduct', req, res));
router.post('/restore', (req, res) => applyChange('restore', req, res));
router.post('/broken', (req, res) => applyChange('broken', req, res));

export default router;
