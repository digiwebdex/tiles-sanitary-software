import { Request, Response, NextFunction } from 'express';

/**
 * Tenant middleware: extracts dealer_id from the authenticated user
 * and attaches it to req.dealerId for use in queries.
 * 
 * For super_admin users, dealerId may be null (they can operate across tenants).
 * For dealer users, dealerId is required.
 */
declare global {
  namespace Express {
    interface Request {
      dealerId?: string | null;
    }
  }
}

export function tenantGuard(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const isSuperAdmin = req.user.roles.includes('super_admin');

  if (isSuperAdmin) {
    // Super admin: use dealer_id from query/body if provided, or null for platform-wide
    req.dealerId = (req.query.dealer_id as string) || (req.body?.dealer_id as string) || null;
    next();
    return;
  }

  const dealerId = req.user.dealerId;
  if (!dealerId) {
    res.status(403).json({ error: 'No dealer assigned to your account' });
    return;
  }

  req.dealerId = dealerId;
  next();
}

/**
 * Require dealer_id: for routes that absolutely need a dealer context.
 * Must be used after tenantGuard.
 */
export function requireDealer(req: Request, res: Response, next: NextFunction): void {
  if (!req.dealerId) {
    res.status(400).json({ error: 'dealer_id is required for this operation' });
    return;
  }
  next();
}

/**
 * Assert that the claimed dealer_id (from request body/params) matches the user's.
 * Prevents horizontal privilege escalation at the service layer.
 */
export function assertDealerMatch(req: Request, res: Response, next: NextFunction): void {
  const claimed = req.body?.dealer_id || req.params?.dealerId;
  if (!claimed) {
    next();
    return;
  }

  const isSuperAdmin = req.user?.roles.includes('super_admin');
  if (isSuperAdmin) {
    next();
    return;
  }

  if (claimed !== req.dealerId) {
    res.status(403).json({ error: 'Access denied: dealer_id mismatch' });
    return;
  }

  next();
}
