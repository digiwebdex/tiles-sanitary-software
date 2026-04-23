import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db/connection';
import { env } from '../config/env';

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
  return {
    userId,
    email: profile?.email ?? '',
    dealerId: profile?.dealer_id ?? null,
    roles: roles.map((r: any) => r.role),
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
      const err: any = new Error('Account is suspended');
      err.code = 'SUSPENDED';
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
    const hash = await this.hashPassword(data.password);

    const [user] = await db('users')
      .insert({
        email: data.email.toLowerCase().trim(),
        password_hash: hash,
        name: data.name.trim(),
      })
      .returning('*');

    await db('profiles').insert({
      id: user.id,
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      dealer_id: data.dealerId ?? null,
    });

    await db('user_roles').insert({
      user_id: user.id,
      role: data.role,
    });

    return user;
  },
};
