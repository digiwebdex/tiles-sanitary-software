/**
 * /api/dealers — Super Admin only.
 *
 * Powers the Super Admin → Dealers panel. All routes require the caller
 * to hold the 'super_admin' role. Returns enriched dealer rows that
 * include the linked admin user, current subscription, and contact info
 * so the UI can render the full table without 1+N follow-up requests.
 *
 * Approval / rejection / suspension all flip BOTH the dealer row and the
 * underlying admin user, then dispatch a notification to the dealer so
 * they know they can log in (or that their account was rejected).
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { dispatchApprovalNotification, sendEmail, sendSms } from '../services/notificationService';

const router = Router();

// All endpoints below require an authenticated super_admin
router.use(authenticate, requireRole('super_admin'));

interface DealerRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  status: string;
  created_at: string;
  admin_email: string | null;
  admin_name: string | null;
  admin_user_id: string | null;
  admin_status: string | null;
  subscription_status: string | null;
  subscription_end: string | null;
  plan_name: string | null;
}

/** GET /api/dealers — list all dealers with their primary admin + subscription. */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db('dealers as d')
      .leftJoin('profiles as p', function () {
        this.on('p.dealer_id', '=', 'd.id');
      })
      .leftJoin('users as u', 'u.id', 'p.id')
      .leftJoin('user_roles as ur', function () {
        this.on('ur.user_id', '=', 'u.id').andOn(db.raw("ur.role = 'dealer_admin'"));
      })
      .leftJoin('subscriptions as s', function () {
        this.on('s.dealer_id', '=', 'd.id');
      })
      .leftJoin('plans as pl', 'pl.id', 's.plan_id')
      .select<DealerRow[]>(
        'd.id',
        'd.name',
        'd.phone',
        'd.address',
        'd.status',
        'd.created_at',
        'u.email as admin_email',
        'u.name as admin_name',
        'u.id as admin_user_id',
        'u.status as admin_status',
        's.status as subscription_status',
        's.end_date as subscription_end',
        'pl.name as plan_name',
      )
      .whereNotNull('ur.user_id') // pick the row that has dealer_admin role
      .orderBy('d.created_at', 'desc');

    res.json({ dealers: rows });
  } catch (err: any) {
    console.error('[dealers:list] failed:', err);
    res.status(500).json({ error: err.message || 'Failed to load dealers' });
  }
});

/** GET /api/dealers/:id — full detail for a single dealer (used by detail sheet). */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const dealer = await db('dealers').where({ id: req.params.id }).first();
    if (!dealer) {
      res.status(404).json({ error: 'Dealer not found' });
      return;
    }
    const profiles = await db('profiles as p')
      .leftJoin('users as u', 'u.id', 'p.id')
      .leftJoin('user_roles as ur', 'ur.user_id', 'u.id')
      .where('p.dealer_id', dealer.id)
      .select(
        'p.id',
        'p.name',
        'p.email',
        'u.status',
        'ur.role',
      );
    const subscription = await db('subscriptions as s')
      .leftJoin('plans as pl', 'pl.id', 's.plan_id')
      .where('s.dealer_id', dealer.id)
      .orderBy('s.created_at', 'desc')
      .select('s.*', 'pl.name as plan_name')
      .first();

    res.json({ dealer, users: profiles, subscription });
  } catch (err: any) {
    console.error('[dealers:get] failed:', err);
    res.status(500).json({ error: err.message || 'Failed to load dealer' });
  }
});

const decisionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/**
 * POST /api/dealers/:id/approve — flip dealer + admin user to active and
 * notify the dealer that they can now log in.
 */
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const dealerId = req.params.id;
    const dealer = await db('dealers').where({ id: dealerId }).first();
    if (!dealer) {
      res.status(404).json({ error: 'Dealer not found' });
      return;
    }

    const admin = await db('profiles as p')
      .leftJoin('users as u', 'u.id', 'p.id')
      .leftJoin('user_roles as ur', 'ur.user_id', 'u.id')
      .where('p.dealer_id', dealerId)
      .where('ur.role', 'dealer_admin')
      .select('u.id', 'u.email', 'u.name')
      .first();

    await db.transaction(async (trx) => {
      await trx('dealers').where({ id: dealerId }).update({ status: 'active' });
      if (admin?.id) {
        await trx('users').where({ id: admin.id }).update({ status: 'active' });
      }
    });

    // Best-effort notification — never block the response on email/SMS.
    if (admin) {
      dispatchApprovalNotification({
        dealerName: admin.name || dealer.name,
        businessName: dealer.name,
        dealerPhone: dealer.phone || '',
        dealerEmail: admin.email || '',
      }).catch((err) => console.error('[dealers:approve] notify failed:', err));
    }

    res.json({ success: true, dealer_id: dealerId, status: 'active' });
  } catch (err: any) {
    console.error('[dealers:approve] failed:', err);
    res.status(500).json({ error: err.message || 'Approval failed' });
  }
});

/**
 * POST /api/dealers/:id/reject — mark dealer + admin as inactive and notify
 * the applicant. We keep the row (for audit) instead of deleting.
 */
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const dealerId = req.params.id;
    const { reason } = decisionSchema.parse(req.body || {});

    const dealer = await db('dealers').where({ id: dealerId }).first();
    if (!dealer) {
      res.status(404).json({ error: 'Dealer not found' });
      return;
    }

    const admin = await db('profiles as p')
      .leftJoin('users as u', 'u.id', 'p.id')
      .where('p.dealer_id', dealerId)
      .select('u.id', 'u.email', 'u.name')
      .first();

    await db.transaction(async (trx) => {
      await trx('dealers').where({ id: dealerId }).update({ status: 'rejected' });
      if (admin?.id) {
        await trx('users').where({ id: admin.id }).update({ status: 'inactive' });
        await trx('refresh_tokens')
          .where({ user_id: admin.id })
          .whereNull('revoked_at')
          .update({ revoked_at: new Date() });
      }
    });

    if (admin?.email) {
      const subject = 'Tiles & Sanitary ERP — Registration Update';
      const text =
        `Dear ${admin.name || 'Applicant'},\n\n` +
        `Thank you for your interest in Tiles & Sanitary ERP.\n` +
        `We're sorry to let you know that your registration for "${dealer.name}" was not approved at this time.\n\n` +
        (reason ? `Reason: ${reason}\n\n` : '') +
        `If you believe this is a mistake, please call us at +880 1674 533303.\n\n` +
        `Best regards,\nTiles & Sanitary ERP Team`;
      sendEmail({ to: admin.email, subject, text }).catch(() => {});
    }
    if (dealer.phone) {
      sendSms({
        to: dealer.phone,
        message:
          `দুঃখিত! আপনার "${dealer.name}" রেজিস্ট্রেশন এই মুহূর্তে অনুমোদিত হয়নি। ` +
          `প্রশ্ন থাকলে কল করুন: +880 1674 533303`,
      }).catch(() => {});
    }

    res.json({ success: true, dealer_id: dealerId, status: 'rejected' });
  } catch (err: any) {
    console.error('[dealers:reject] failed:', err);
    res.status(500).json({ error: err.message || 'Rejection failed' });
  }
});

/** POST /api/dealers/:id/suspend — temporary disable for an active dealer. */
router.post('/:id/suspend', async (req: Request, res: Response) => {
  try {
    const dealerId = req.params.id;
    const dealer = await db('dealers').where({ id: dealerId }).first();
    if (!dealer) {
      res.status(404).json({ error: 'Dealer not found' });
      return;
    }

    const adminIds = await db('profiles')
      .where({ dealer_id: dealerId })
      .pluck('id');

    await db.transaction(async (trx) => {
      await trx('dealers').where({ id: dealerId }).update({ status: 'suspended' });
      if (adminIds.length) {
        await trx('users').whereIn('id', adminIds).update({ status: 'suspended' });
        await trx('refresh_tokens')
          .whereIn('user_id', adminIds)
          .whereNull('revoked_at')
          .update({ revoked_at: new Date() });
      }
    });

    res.json({ success: true, dealer_id: dealerId, status: 'suspended' });
  } catch (err: any) {
    console.error('[dealers:suspend] failed:', err);
    res.status(500).json({ error: err.message || 'Suspend failed' });
  }
});

/** POST /api/dealers/:id/reactivate — undo a suspension. */
router.post('/:id/reactivate', async (req: Request, res: Response) => {
  try {
    const dealerId = req.params.id;
    const dealer = await db('dealers').where({ id: dealerId }).first();
    if (!dealer) {
      res.status(404).json({ error: 'Dealer not found' });
      return;
    }

    const adminIds = await db('profiles')
      .where({ dealer_id: dealerId })
      .pluck('id');

    await db.transaction(async (trx) => {
      await trx('dealers').where({ id: dealerId }).update({ status: 'active' });
      if (adminIds.length) {
        await trx('users').whereIn('id', adminIds).update({ status: 'active' });
      }
    });

    res.json({ success: true, dealer_id: dealerId, status: 'active' });
  } catch (err: any) {
    console.error('[dealers:reactivate] failed:', err);
    res.status(500).json({ error: err.message || 'Reactivate failed' });
  }
});

export default router;
