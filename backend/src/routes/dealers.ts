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
  email: string | null;
  owner_name: string | null;
  business_type: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  postal_code: string | null;
  tax_id: string | null;
  trade_license_no: string | null;
  website: string | null;
  logo_url: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
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
        'd.email',
        'd.owner_name',
        'd.business_type',
        'd.city',
        'd.district',
        'd.country',
        'd.postal_code',
        'd.tax_id',
        'd.trade_license_no',
        'd.website',
        'd.logo_url',
        'd.notes',
        'd.status',
        'd.created_at',
        'd.updated_at',
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

/**
 * POST /api/dealers/:id/reset-password — Super Admin force-resets the dealer
 * admin's password. Two modes:
 *   1) `mode: "temp"` (default) — generate a strong temporary password,
 *      set it on the user, revoke all sessions, and send the temp password
 *      to the dealer via Email + SMS. They can sign in immediately and
 *      change it from settings.
 *   2) `mode: "link"` — issue a single-use password-reset token (30-min
 *      TTL) and email a reset link. SMS the same link short-coded.
 *
 * Always revokes existing refresh tokens so old sessions can't continue.
 */
const resetPasswordSchema = z.object({
  mode: z.enum(['temp', 'link']).optional(),
});

function generateTempPassword(): string {
  // 10 chars: upper + lower + digit + symbol — readable for SMS.
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const sym = '@#$%&';
  const all = upper + lower + digit + sym;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let pwd = pick(upper) + pick(lower) + pick(digit) + pick(sym);
  for (let i = 0; i < 6; i++) pwd += pick(all);
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

router.post('/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const dealerId = req.params.id;
    const { mode = 'temp' } = resetPasswordSchema.parse(req.body || {});

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

    if (!admin?.id || !admin?.email) {
      res.status(400).json({ error: 'No dealer admin user found for this dealer' });
      return;
    }

    // Lazy-load to avoid circular imports between dealers route and authService
    const { authService } = await import('../services/authService');
    const appBase =
      process.env.APP_BASE_URL ||
      process.env.PORTAL_BASE_URL ||
      'https://app.sanitileserp.com';

    if (mode === 'link') {
      const result = await authService.requestPasswordReset(admin.email);
      const token = result?.token;
      if (!token) {
        res.status(500).json({ error: 'Failed to issue reset token' });
        return;
      }
      const link = `${appBase}/reset-password?token=${encodeURIComponent(token)}`;

      sendEmail({
        to: admin.email,
        subject: 'Tiles & Sanitary ERP — Password reset link',
        text:
          `Dear ${admin.name || 'User'},\n\n` +
          `A password reset has been initiated for your account by the system administrator.\n\n` +
          `Reset link (valid for 30 minutes):\n${link}\n\n` +
          `If you did not request this, please contact support at +880 1674 533303.\n\n` +
          `— Tiles & Sanitary ERP`,
      }).catch(() => {});

      if (dealer.phone) {
        sendSms({
          to: dealer.phone,
          message:
            `আপনার পাসওয়ার্ড রিসেট লিংক (৩০ মিনিট): ${link}\n` +
            `সাহায্য: +880 1674 533303`,
        }).catch(() => {});
      }

      res.json({ success: true, mode: 'link' });
      return;
    }

    // mode === 'temp'
    const tempPassword = generateTempPassword();
    const passwordHash = await authService.hashPassword(tempPassword);

    await db.transaction(async (trx) => {
      await trx('users').where({ id: admin.id }).update({
        password_hash: passwordHash,
        updated_at: new Date(),
      });
      // Revoke all sessions so old logins are kicked out.
      await trx('refresh_tokens')
        .where({ user_id: admin.id })
        .whereNull('revoked_at')
        .update({ revoked_at: new Date() });
      // Clear lockout history so they can sign in immediately.
      await trx('login_attempts')
        .where({ email: admin.email.toLowerCase().trim() })
        .del();
    });

    sendEmail({
      to: admin.email,
      subject: 'Tiles & Sanitary ERP — Your password has been reset',
      text:
        `Dear ${admin.name || 'User'},\n\n` +
        `Your password was reset by the system administrator.\n\n` +
        `Email: ${admin.email}\n` +
        `Temporary password: ${tempPassword}\n\n` +
        `Please sign in at ${appBase}/login and change your password from Settings immediately.\n\n` +
        `If you did not expect this, contact support at +880 1674 533303.\n\n` +
        `— Tiles & Sanitary ERP`,
    }).catch(() => {});

    if (dealer.phone) {
      sendSms({
        to: dealer.phone,
        message:
          `আপনার পাসওয়ার্ড রিসেট হয়েছে।\n` +
          `Email: ${admin.email}\n` +
          `New password: ${tempPassword}\n` +
          `লগইন: ${appBase}/login`,
      }).catch(() => {});
    }

    res.json({ success: true, mode: 'temp' });
  } catch (err: any) {
    console.error('[dealers:reset-password] failed:', err);
    res.status(500).json({ error: err.message || 'Password reset failed' });
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

/**
 * PATCH /api/dealers/:id — update dealer business profile fields. Also lets
 * the Super Admin rename / re-email / change phone for the linked dealer_admin
 * user (those go on `users` + `profiles`, not on `dealers`).
 *
 * All fields are optional; only provided keys are updated. Strings are
 * trimmed; empty strings clear the field (set to NULL) so the UI can erase
 * a value by submitting "".
 */
const updateDealerSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  owner_name: z.string().trim().max(200).optional().or(z.literal('')),
  business_type: z.string().trim().max(100).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  district: z.string().trim().max(100).optional().or(z.literal('')),
  country: z.string().trim().max(100).optional().or(z.literal('')),
  postal_code: z.string().trim().max(20).optional().or(z.literal('')),
  tax_id: z.string().trim().max(50).optional().or(z.literal('')),
  trade_license_no: z.string().trim().max(50).optional().or(z.literal('')),
  website: z.string().trim().max(200).optional().or(z.literal('')),
  logo_url: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  // Admin user fields (live on users + profiles, not on dealers)
  admin_name: z.string().trim().min(1).max(200).optional(),
  admin_email: z.string().trim().email().max(200).optional(),
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = req.params.id;
    const body = updateDealerSchema.parse(req.body || {});

    const dealer = await db('dealers').where({ id: dealerId }).first();
    if (!dealer) {
      res.status(404).json({ error: 'Dealer not found' });
      return;
    }

    // Build dealer-table update payload. Empty strings -> null, undefined -> skip.
    const dealerKeys = [
      'name', 'phone', 'email', 'owner_name', 'business_type', 'address',
      'city', 'district', 'country', 'postal_code', 'tax_id',
      'trade_license_no', 'website', 'logo_url', 'notes',
    ] as const;

    const dealerUpdate: Record<string, any> = {};
    for (const k of dealerKeys) {
      const v = (body as any)[k];
      if (v === undefined) continue;
      dealerUpdate[k] = v === '' ? null : v;
    }

    if (Object.keys(dealerUpdate).length > 0) {
      dealerUpdate.updated_at = new Date();
    }

    let adminUpdated = false;
    if (body.admin_name || body.admin_email) {
      const admin = await db('profiles as p')
        .leftJoin('user_roles as ur', 'ur.user_id', 'p.id')
        .where('p.dealer_id', dealerId)
        .where('ur.role', 'dealer_admin')
        .select('p.id')
        .first();

      if (!admin?.id) {
        res.status(400).json({ error: 'No dealer_admin user found for this dealer' });
        return;
      }

      if (body.admin_email) {
        const lower = body.admin_email.toLowerCase().trim();
        const clash = await db('users')
          .whereRaw('LOWER(email) = ?', [lower])
          .whereNot({ id: admin.id })
          .first();
        if (clash) {
          res.status(409).json({ error: 'That email is already used by another user' });
          return;
        }
      }

      await db.transaction(async (trx) => {
        if (Object.keys(dealerUpdate).length > 0) {
          await trx('dealers').where({ id: dealerId }).update(dealerUpdate);
        }
        const userPatch: Record<string, any> = { updated_at: new Date() };
        const profilePatch: Record<string, any> = {};
        if (body.admin_name) {
          userPatch.name = body.admin_name;
          profilePatch.name = body.admin_name;
        }
        if (body.admin_email) {
          userPatch.email = body.admin_email.toLowerCase().trim();
          profilePatch.email = body.admin_email.toLowerCase().trim();
        }
        await trx('users').where({ id: admin.id }).update(userPatch);
        if (Object.keys(profilePatch).length > 0) {
          await trx('profiles').where({ id: admin.id }).update(profilePatch);
        }
      });
      adminUpdated = true;
    } else if (Object.keys(dealerUpdate).length > 0) {
      await db('dealers').where({ id: dealerId }).update(dealerUpdate);
    }

    if (Object.keys(dealerUpdate).length === 0 && !adminUpdated) {
      res.status(400).json({ error: 'No changes provided' });
      return;
    }

    const updated = await db('dealers').where({ id: dealerId }).first();
    res.json({ success: true, dealer: updated });
  } catch (err: any) {
    if (err?.issues) {
      res.status(400).json({ error: err.issues[0]?.message || 'Invalid input' });
      return;
    }
    console.error('[dealers:update] failed:', err);
    res.status(500).json({ error: err.message || 'Update failed' });
  }
});

export default router;
