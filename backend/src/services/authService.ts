import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db/connection';
import { env } from '../config/env';
import { dispatchSignupNotifications } from './notificationService';

const SALT_ROUNDS = 12;

// Lockout policy — match existing Supabase RPC behaviour (3 strikes / 30 min)
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 30;
const ATTEMPT_WINDOW_MINUTES = 30;

// Password reset
const RESET_TOKEN_TTL_MINUTES = 30;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  dealerId: string | null;
  roles: string[];
  subscription?: {
    id: string;
    planId: string;
    status: 'active' | 'expired' | 'suspended';
    startDate: string;
    endDate: string | null;
  } | null;
}

export interface LockStatus {
  locked: boolean;
  remaining_minutes?: number;
  remaining_attempts?: number;
}

function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET as jwt.Secret, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function generateRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = crypto.randomBytes(64).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + parseDuration(env.JWT_REFRESH_EXPIRES_IN));
  return { token, hash, expiresAt };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function dateOnly(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function parseDuration(dur: string): number {
  const match = dur.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(match[1]);
  switch (match[2]) {
    case 's': return n * 1000;
    case 'm': return n * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    case 'd': return n * 24 * 60 * 60 * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}

async function buildJwtPayload(userId: string): Promise<JwtPayload> {
  const profile = await db('profiles').where({ id: userId }).first();
  const roles = await db('user_roles').where({ user_id: userId }).select('role');
  const roleNames = roles.map((r: any) => r.role);
  let subscription: JwtPayload['subscription'] = null;

  if (profile?.dealer_id && roleNames.some((r: string) => r === 'dealer_admin' || r === 'salesman')) {
    const sub = await db('subscriptions')
      .where({ dealer_id: profile.dealer_id })
      .orderBy('start_date', 'desc')
      .orderBy('created_at', 'desc')
      .first();

    if (sub) {
      subscription = {
        id: sub.id,
        planId: sub.plan_id,
        status: sub.status,
        startDate: dateOnly(sub.start_date) ?? '',
        endDate: dateOnly(sub.end_date),
      };
    }
  }

  return {
    userId,
    email: profile?.email ?? '',
    dealerId: profile?.dealer_id ?? null,
    roles: roleNames,
    subscription,
  };
}

// ── Lockout helpers ────────────────────────────────────────────────────────

async function checkLockStatus(email: string): Promise<LockStatus> {
  const normalized = email.toLowerCase().trim();
  const now = new Date();

  // Active lockout?
  const lock = await db('login_attempts')
    .where({ email: normalized, is_locked: true })
    .where('locked_until', '>', now)
    .orderBy('locked_until', 'desc')
    .first();

  if (lock) {
    const remainingMs = new Date(lock.locked_until).getTime() - now.getTime();
    return {
      locked: true,
      remaining_minutes: Math.max(1, Math.ceil(remainingMs / 60000)),
    };
  }

  const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
  const recentFails = await db('login_attempts')
    .where({ email: normalized })
    .where('attempted_at', '>=', windowStart)
    .count<{ count: string }[]>('* as count');

  const fails = parseInt(recentFails[0]?.count ?? '0', 10);
  return {
    locked: false,
    remaining_attempts: Math.max(0, MAX_FAILED_ATTEMPTS - fails),
  };
}

async function recordFailedAttempt(email: string, ip?: string): Promise<LockStatus> {
  const normalized = email.toLowerCase().trim();
  const now = new Date();
  const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);

  await db('login_attempts').insert({
    email: normalized,
    ip_address: ip ?? null,
    is_locked: false,
  });

  const recentFails = await db('login_attempts')
    .where({ email: normalized })
    .where('attempted_at', '>=', windowStart)
    .count<{ count: string }[]>('* as count');

  const fails = parseInt(recentFails[0]?.count ?? '0', 10);

  if (fails >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
    await db('login_attempts').insert({
      email: normalized,
      ip_address: ip ?? null,
      is_locked: true,
      locked_until: lockedUntil,
    });
    return { locked: true, remaining_minutes: LOCKOUT_MINUTES };
  }

  return { locked: false, remaining_attempts: MAX_FAILED_ATTEMPTS - fails };
}

async function clearAttempts(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  await db('login_attempts').where({ email: normalized }).del();
}

// ── Public service API ────────────────────────────────────────────────────

export const authService = {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  },

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  /** Read-only lock check (used before attempting login). */
  async checkLock(email: string): Promise<LockStatus> {
    return checkLockStatus(email);
  },

  /**
   * Login with full lockout enforcement.
   * Throws structured errors that routes translate into 401/423.
   */
  async login(
    email: string,
    password: string,
    ip?: string,
  ): Promise<TokenPair & { user: JwtPayload; lock: LockStatus }> {
    const normalized = email.toLowerCase().trim();

    // 1. Lock check
    const lock = await checkLockStatus(normalized);
    if (lock.locked) {
      const err: any = new Error('Account is locked');
      err.code = 'LOCKED';
      err.lock = lock;
      throw err;
    }

    // 2. Lookup
    const user = await db('users').where({ email: normalized }).first();
    if (!user) {
      const after = await recordFailedAttempt(normalized, ip);
      const err: any = new Error('Invalid email or password');
      err.code = 'INVALID_CREDENTIALS';
      err.lock = after;
      throw err;
    }

    if (user.status !== 'active') {
      const err: any = new Error(
        user.status === 'pending'
          ? 'Account is awaiting Super Admin approval'
          : 'Account is suspended'
      );
      err.code = user.status === 'pending' ? 'PENDING_APPROVAL' : 'SUSPENDED';
      throw err;
    }

    // 3. Password verify
    const valid = await this.verifyPassword(password, user.password_hash);
    if (!valid) {
      const after = await recordFailedAttempt(normalized, ip);
      const err: any = new Error('Invalid email or password');
      err.code = after.locked ? 'LOCKED' : 'INVALID_CREDENTIALS';
      err.lock = after;
      throw err;
    }

    // 4. Success — clear attempts, issue tokens
    await clearAttempts(normalized);

    const payload = await buildJwtPayload(user.id);
    const accessToken = signAccessToken(payload);
    const { token: refreshToken, hash, expiresAt } = generateRefreshToken();

    await db('refresh_tokens').insert({
      user_id: user.id,
      token_hash: hash,
      expires_at: expiresAt,
    });

    // Cleanup expired tokens for this user (housekeeping)
    await db('refresh_tokens')
      .where('user_id', user.id)
      .where('expires_at', '<', new Date())
      .del();

    return { accessToken, refreshToken, user: payload, lock: { locked: false } };
  },

  /**
   * Refresh with explicit rotation:
   *   - old token must be unrevoked + unexpired
   *   - old token marked revoked + linked to new
   *   - new token issued
   * Reuse of a revoked token = breach signal → revoke entire family for user.
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair & { user: JwtPayload }> {
    const hash = hashToken(refreshToken);

    const stored = await db('refresh_tokens').where({ token_hash: hash }).first();

    if (!stored) {
      const err: any = new Error('Invalid refresh token');
      err.code = 'INVALID_REFRESH';
      throw err;
    }

    // Reuse detection: token was already rotated → suspected leak. Nuke family.
    if (stored.revoked_at) {
      await db('refresh_tokens').where({ user_id: stored.user_id }).update({
        revoked_at: new Date(),
      });
      const err: any = new Error('Refresh token reuse detected; session revoked');
      err.code = 'REFRESH_REUSE';
      throw err;
    }

    if (new Date(stored.expires_at) <= new Date()) {
      const err: any = new Error('Refresh token expired');
      err.code = 'REFRESH_EXPIRED';
      throw err;
    }

    // Issue new
    const payload = await buildJwtPayload(stored.user_id);
    const accessToken = signAccessToken(payload);
    const { token: newRefreshTokenStr, hash: newHash, expiresAt } = generateRefreshToken();

    const [created] = await db('refresh_tokens')
      .insert({
        user_id: stored.user_id,
        token_hash: newHash,
        expires_at: expiresAt,
      })
      .returning('id');

    // Mark old as revoked + linked to new
    await db('refresh_tokens').where({ id: stored.id }).update({
      revoked_at: new Date(),
      replaced_by: created?.id ?? created,
    });

    return { accessToken, refreshToken: newRefreshTokenStr, user: payload };
  },

  async logout(refreshToken: string): Promise<void> {
    const hash = hashToken(refreshToken);
    // Mark revoked rather than delete — preserves audit trail for reuse detection
    await db('refresh_tokens').where({ token_hash: hash }).update({
      revoked_at: new Date(),
    });
  },

  async logoutAll(userId: string): Promise<void> {
    await db('refresh_tokens')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .update({ revoked_at: new Date() });
  },

  verifyAccessToken(token: string): JwtPayload {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  },

  async getUserPayload(userId: string): Promise<JwtPayload> {
    return buildJwtPayload(userId);
  },

  // ── Password reset ──

  /**
   * Request a reset token for an email.
   * Always returns the same shape regardless of whether the email exists
   * (prevents user enumeration). Returns the raw token + user for the
   * caller (route) to dispatch via email.
   */
  async requestPasswordReset(email: string): Promise<{ token: string; userId: string } | null> {
    const normalized = email.toLowerCase().trim();
    const user = await db('users').where({ email: normalized }).first();
    if (!user) return null;

    const token = crypto.randomBytes(48).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    // Invalidate any existing unused tokens for this user
    await db('password_reset_tokens')
      .where({ user_id: user.id })
      .whereNull('used_at')
      .update({ used_at: new Date() });

    await db('password_reset_tokens').insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    return { token, userId: user.id };
  },

  /** Consume a reset token + set new password. Single-use. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!token || newPassword.length < 6) {
      throw new Error('Invalid reset request');
    }
    const tokenHash = hashToken(token);
    const stored = await db('password_reset_tokens')
      .where({ token_hash: tokenHash })
      .whereNull('used_at')
      .where('expires_at', '>', new Date())
      .first();

    if (!stored) throw new Error('Invalid or expired reset token');

    const passwordHash = await this.hashPassword(newPassword);

    await db.transaction(async (trx) => {
      await trx('users').where({ id: stored.user_id }).update({
        password_hash: passwordHash,
        updated_at: new Date(),
      });
      await trx('password_reset_tokens').where({ id: stored.id }).update({
        used_at: new Date(),
      });
      // Revoke all sessions on password change
      await trx('refresh_tokens')
        .where({ user_id: stored.user_id })
        .whereNull('revoked_at')
        .update({ revoked_at: new Date() });
      // Clear lockout history
      const profile = await trx('profiles').where({ id: stored.user_id }).first();
      if (profile?.email) {
        await trx('login_attempts').where({ email: profile.email.toLowerCase().trim() }).del();
      }
    });
  },

  async createUser(data: {
    email: string;
    password: string;
    name: string;
    dealerId?: string;
    role: 'dealer_admin' | 'salesman' | 'super_admin';
  }) {
    if ((data.role === 'dealer_admin' || data.role === 'salesman') && !data.dealerId) {
      throw new Error(`${data.role} users must be linked to a dealer`);
    }

    const hash = await this.hashPassword(data.password);

    const user = await db.transaction(async (trx) => {
      const [createdUser] = await trx('users')
        .insert({
          email: data.email.toLowerCase().trim(),
          password_hash: hash,
          name: data.name.trim(),
        })
        .returning('*');

      await trx('profiles').insert({
        id: createdUser.id,
        name: data.name.trim(),
        email: data.email.toLowerCase().trim(),
        dealer_id: data.dealerId ?? null,
      });

      await trx('user_roles')
        .insert({ user_id: createdUser.id, role: data.role })
        .onConflict(['user_id', 'role'])
        .ignore();

      return createdUser;
    });

    return user;
  },

  /**
   * Self-signup: provision a brand-new dealer + admin user + 3-day trial,
   * but leave both the dealer and the admin user in 'pending' state until
   * a Super Admin approves them. We DO NOT issue tokens here — login is
   * blocked until approval. The login route translates the 'pending'
   * status into a friendly 'awaiting approval' error.
   *
   * All inserts run in a single transaction so a partial failure leaves
   * no orphaned dealers, profiles, or roles.
   */
  async register(input: {
    name: string;
    business_name: string;
    phone: string;
    email: string;
    password: string;
    ip?: string;
  }): Promise<{ dealerId: string; userId: string; pending: true }> {
    const name = input.name.trim();
    const businessName = input.business_name.trim();
    const phone = input.phone.trim();
    const email = input.email.toLowerCase().trim();
    const password = input.password;

    // Email uniqueness — surface a friendly 409 instead of a Postgres unique-violation.
    const existing = await db('users').where({ email }).first();
    if (existing) {
      const err: any = new Error('An account with this email already exists. Please sign in.');
      err.code = 'EMAIL_TAKEN';
      throw err;
    }

    const passwordHash = await this.hashPassword(password);

    const { dealerId, userId } = await db.transaction(async (trx) => {
      // 1. Dealer in PENDING state — invisible to login flows until approved.
      const [dealer] = await trx('dealers')
        .insert({ name: businessName, phone, status: 'pending' })
        .returning('id');
      const dId: string = dealer.id ?? dealer;

      // 2. User in PENDING state — login throws PENDING_APPROVAL until SA approves.
      const [user] = await trx('users')
        .insert({ email, password_hash: passwordHash, name, status: 'pending' })
        .returning('*');

      // 3. Profile (linked to dealer)
      await trx('profiles').insert({
        id: user.id,
        name,
        email,
        dealer_id: dId,
      });

      // 4. Dealer owner role. This must succeed before signup is considered provisioned.
      await trx('user_roles')
        .insert({ user_id: user.id, role: 'dealer_admin' })
        .onConflict(['user_id', 'role'])
        .ignore();

      // 5. Invoice sequence (so first sale doesn't race the upsert)
      await trx('invoice_sequences').insert({
        dealer_id: dId,
        next_invoice_no: 1,
        next_challan_no: 1,
      }).onConflict('dealer_id').ignore();

      // 6. 3-day trial subscription on the cheapest active plan.
      //    Falls back to creating a "Free Trial" plan row if no plans exist yet.
      let plan = await trx('plans').orderBy('price_monthly', 'asc').first();
      if (!plan) {
        const [created] = await trx('plans')
          .insert({ name: 'Free Trial', price_monthly: 0, price_yearly: 0, max_users: 1 })
          .returning('*');
        plan = created;
      }

      const startDate = new Date().toISOString().split('T')[0];
      const endDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      await trx('subscriptions').insert({
        dealer_id: dId,
        plan_id: plan.id,
        status: 'active',
        billing_cycle: 'monthly',
        start_date: startDate,
        end_date: endDate,
      });

      // 7. Notification settings (best-effort; ignore if table shape differs)
      try {
        await trx('notification_settings').insert({
          dealer_id: dId,
          owner_email: email,
          owner_phone: phone,
          enable_sale_sms: true,
          enable_sale_email: true,
          enable_daily_summary_sms: true,
          enable_daily_summary_email: true,
        });
      } catch (e) {
        console.warn('[register] notification_settings insert skipped:', (e as Error).message);
      }

      return { dealerId: dId, userId: user.id };
    });

    // ── Fire-and-forget signup notifications (SMS + email to dealer & admin) ──
    // Never blocks the response — the user gets their "pending approval" screen
    // immediately and the dispatcher logs failures.
    dispatchSignupNotifications({
      dealerName: name,
      businessName,
      dealerPhone: phone,
      dealerEmail: email,
      adminPhone: env.ADMIN_PHONE,
      adminEmail: env.ADMIN_EMAIL,
    }).catch((err) => {
      console.error('[register] signup notification dispatch failed:', err);
    });

    return { dealerId, userId, pending: true };
  },
};

