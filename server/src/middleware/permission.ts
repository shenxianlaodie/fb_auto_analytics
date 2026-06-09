import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

/** Require admin role */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: '权限不足，仅管理员可操作' });
    return;
  }
  next();
}

/** Check that the requested accountId is in the user's allowed list.
 *  Admin users with empty allowed_accounts have access to all accounts. */
export function requireAccountAccess(req: AuthRequest, res: Response, next: NextFunction): void {
  // Admin with no restriction → allow all
  if (req.userRole === 'admin' && (!req.userAllowedAccounts || req.userAllowedAccounts.length === 0)) {
    return next();
  }

  const accountId = (req.query.accountId || req.body.accountId || req.params.accountId || '') as string;
  if (!accountId) {
    // If no accountId specified, allow through (filtering happens in the route handler)
    return next();
  }

  const normalized = accountId.replace(/^act_/, '');
  const allowed = (req.userAllowedAccounts || []).map((a: string) => a.replace(/^act_/, ''));

  if (!allowed.includes(normalized)) {
    res.status(403).json({ error: '您无权访问此广告账户' });
    return;
  }

  next();
}
