import { Request, Response, NextFunction } from 'express';
import { authService, JwtPayload } from '../services/authService';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Authenticate: verifies JWT access token from Authorization header.
 * Attaches user payload to req.user.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const token = header.slice(7);
    req.user = authService.verifyAccessToken(token);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional auth: if token present, decode it; if not, proceed without user.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = authService.verifyAccessToken(header.slice(7));
    } catch {
      // Ignore — proceed without auth
    }
  }
  next();
}
