/**
 * /api/subscription/status — server-clock subscription enforcement.
 *
 * P1 fix: previous implementation computed expiry on the browser,
 * letting anyone with devtools shift their machine clock to bypass
 * subscription gates. This endpoint always uses NOW() from the
 * Postgres server.
 *
 * Returns:
 *   { status: 'active' | 'expiring' | 'grace' | 'expired' | 'suspended' | 'none',
 *     end_date, days_remaining, is_super_admin, dealer_id }
 *
 * Frontend should poll this every page load / on demand and treat
 * 'expired' / 'suspended' as a hard gate.
 */
import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

const GRACE_DAYS = 3;
const EXPIRING_SOON_DAYS = 7;

router.get('/status', async (req: Request, res: Response) => {
  try {
    const isSuper = req.user?.roles.includes('super_admin') ?? false;
    if (isSuper) {
      res.json({
        status: 'active',
        end_date: null,
        days_remaining: null,
        is_super_admin: true,
        dealer_id: null,
      });
      return;
    }

    const dealerId = req.user?.dealerId;
    if (!dealerId) {
      res.json({
        status: 'none',
        end_date: null,
        days_remaining: null,
        is_super_admin: false,
        dealer_id: null,
      });
      return;
    }

    // Use server NOW() — never trust the client clock.
    const sub = await db('subscriptions')
      .where({ dealer_id: dealerId })
      .orderBy('start_date', 'desc')
      .orderBy('created_at', 'desc')
      .first();

    if (!sub) {
      res.json({
        status: 'none',
        end_date: null,
        days_remaining: null,
        is_super_admin: false,
        dealer_id: dealerId,
      });
      return;
    }

    if (sub.status === 'suspended') {
      res.json({
        status: 'suspended',
        end_date: sub.end_date,
        days_remaining: 0,
        is_super_admin: false,
        dealer_id: dealerId,
      });
      return;
    }

    // Compute days remaining using the database clock for safety.
    const result = await db.raw(
      `SELECT (DATE(?::date) - CURRENT_DATE)::int AS days_remaining`,
      [sub.end_date],
    );
    const daysRemaining: number =
      result.rows?.[0]?.days_remaining ?? -9999;

    let status: 'active' | 'expiring' | 'grace' | 'expired';
    if (daysRemaining > EXPIRING_SOON_DAYS) status = 'active';
    else if (daysRemaining >= 0) status = 'expiring';
    else if (daysRemaining >= -GRACE_DAYS) status = 'grace';
    else status = 'expired';

    res.json({
      status,
      end_date: sub.end_date,
      days_remaining: daysRemaining,
      is_super_admin: false,
      dealer_id: dealerId,
    });
  } catch (err: any) {
    console.error('[subscription/status]', err.message);
    res.status(500).json({ error: 'Failed to check subscription' });
  }
});

export default router;
