/**
 * /api/admin — Super Admin aggregate stats.
 *
 * Used by Super Admin → System Monitoring + Dashboard pages to render
 * platform-wide counts (users, sales, dealers, active subs) and revenue
 * aggregates without N round-trips. All routes require super_admin.
 */
import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const router = Router();
router.use(authenticate, requireRole('super_admin'));

/** GET /api/admin/system-stats — platform-wide counts. */
router.get('/system-stats', async (_req: Request, res: Response) => {
  try {
    const [profilesRes, salesRes, dealersRes, subsRes] = await Promise.all([
      db('profiles').count<{ count: string }[]>('id as count'),
      db('sales').count<{ count: string }[]>('id as count'),
      db('dealers').count<{ count: string }[]>('id as count'),
      db('subscriptions').where({ status: 'active' }).count<{ count: string }[]>('id as count'),
    ]);

    return res.json({
      totalUsers: Number(profilesRes[0]?.count ?? 0),
      totalSales: Number(salesRes[0]?.count ?? 0),
      totalDealers: Number(dealersRes[0]?.count ?? 0),
      activeSubs: Number(subsRes[0]?.count ?? 0),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/dashboard
 * Returns the same shape SADashboardPage previously assembled from three
 * Supabase queries: dealers, subscriptions (with plan price), and
 * subscription_payments. UI computes derived metrics on its own.
 */
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const [dealers, subscriptions, payments] = await Promise.all([
      db('dealers').select('id', 'status'),
      db('subscriptions as s')
        .leftJoin('subscription_plans as p', 'p.id', 's.plan_id')
        .select(
          's.id',
          's.status',
          's.start_date',
          's.end_date',
          's.plan_id',
          's.dealer_id',
          'p.monthly_price',
          'p.yearly_price',
        ),
      db('subscription_payments').select('id', 'amount', 'payment_date', 'payment_status'),
    ]);

    return res.json({
      dealers,
      subscriptions: subscriptions.map((s: any) => ({
        id: s.id,
        status: s.status,
        start_date: s.start_date,
        end_date: s.end_date,
        plan_id: s.plan_id,
        dealer_id: s.dealer_id,
        subscription_plans: s.monthly_price === null && s.yearly_price === null
          ? null
          : { monthly_price: s.monthly_price, yearly_price: s.yearly_price },
      })),
      payments,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
