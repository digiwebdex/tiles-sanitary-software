import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db/connection';
import { env } from '../config/env';

const SALT_ROUNDS = 12;

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

function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

function signRefreshToken(userId: string): { token: string; hash: string; expiresAt: Date } {
  const token = crypto.randomBytes(64).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const ms = parseDuration(env.JWT_REFRESH_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + ms);
  return { token, hash, expiresAt };
}

function parseDuration(dur: string): number {
  const match = dur.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
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

export const authService = {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  },

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  async login(email: string, password: string): Promise<TokenPair & { user: JwtPayload }> {
    const user = await db('users')
      .where({ email: email.toLowerCase().trim() })
      .first();

    if (!user) throw new Error('Invalid email or password');
    if (user.status !== 'active') throw new Error('Account is suspended');

    const valid = await this.verifyPassword(password, user.password_hash);
    if (!valid) throw new Error('Invalid email or password');

    const payload = await buildJwtPayload(user.id);
    const accessToken = signAccessToken(payload);
    const { token: refreshToken, hash, expiresAt } = signRefreshToken(user.id);

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

    return { accessToken, refreshToken, user: payload };
  },

  async refreshTokens(refreshToken: string): Promise<TokenPair & { user: JwtPayload }> {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const stored = await db('refresh_tokens')
      .where({ token_hash: hash })
      .where('expires_at', '>', new Date())
      .first();

    if (!stored) throw new Error('Invalid or expired refresh token');

    // Rotate: delete old, issue new
    await db('refresh_tokens').where({ id: stored.id }).del();

    const payload = await buildJwtPayload(stored.user_id);
    const accessToken = signAccessToken(payload);
    const { token: newRefreshToken, hash: newHash, expiresAt } = signRefreshToken(stored.user_id);

    await db('refresh_tokens').insert({
      user_id: stored.user_id,
      token_hash: newHash,
      expires_at: expiresAt,
    });

    return { accessToken, refreshToken: newRefreshToken, user: payload };
  },

  async logout(refreshToken: string): Promise<void> {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await db('refresh_tokens').where({ token_hash: hash }).del();
  },

  async logoutAll(userId: string): Promise<void> {
    await db('refresh_tokens').where({ user_id: userId }).del();
  },

  verifyAccessToken(token: string): JwtPayload {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
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
