import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { FacebookClient } from '../services/facebookClient';
import { getCachedAccountsForUser, upsertAccountsForUser } from '../models/adAccount';
import { getUserById, touchAccountsSyncedAt } from '../models/user';

export const accountsRouter = Router();
accountsRouter.use(authMiddleware);

const ACCOUNTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function fbErrorMessage(err: any): string {
  const fb = err?.response?.data?.error;
  if (fb?.error_user_msg) return fb.error_user_msg;
  if (fb?.message) return fb.message;
  return err?.message || '获取广告账户失败';
}

function isCacheFresh(syncedAt: string | null | undefined): boolean {
  if (!syncedAt) return false;
  return Date.now() - new Date(syncedAt).getTime() < ACCOUNTS_CACHE_TTL_MS;
}

/** Filter accounts by user's allowed_accounts permission */
function filterByPermission(
  accounts: any[],
  role: string,
  allowedAccounts: string[]
): any[] {
  // Admin with no restriction → return all
  if (role === 'admin' && (!allowedAccounts || allowedAccounts.length === 0)) {
    return accounts;
  }
  // Filter by allowed list
  const allowed = (allowedAccounts || []).map((a: string) => a.replace(/^act_/, ''));
  if (allowed.length === 0) return [];
  return accounts.filter((acc: any) => {
    const accId = (acc.account_id || acc.id || '').replace(/^act_/, '');
    return allowed.includes(accId);
  });
}

// GET /api/accounts
accountsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const forceRefresh = req.query.refresh === 'true';
  const user = await getUserById(req.userId!);
  const cached = await getCachedAccountsForUser(req.userId!);
  const cacheFresh = isCacheFresh(user?.accounts_synced_at);

  if (!forceRefresh && cached.length > 0 && cacheFresh) {
    const filtered = filterByPermission(cached, req.userRole!, req.userAllowedAccounts!);
    res.json({ data: filtered, source: 'cache', total: filtered.length });
    return;
  }

  try {
    const fbClient = FacebookClient.getInstance();
    const accounts = await fbClient.getAdAccounts(req.accessToken!);
    await upsertAccountsForUser(req.userId!, accounts);
    await touchAccountsSyncedAt(req.userId!);
    console.log(`[Accounts] User ${req.userId} synced ${accounts.length} ad accounts from Facebook`);
    const filtered = filterByPermission(accounts, req.userRole!, req.userAllowedAccounts!);
    res.json({ data: filtered, source: 'facebook', total: filtered.length });
  } catch (err: any) {
    console.error('[Accounts] Facebook fetch failed:', fbErrorMessage(err));

    const filtered = filterByPermission(cached, req.userRole!, req.userAllowedAccounts!);
    if (filtered.length > 0) {
      res.json({
        data: filtered,
        source: 'cache',
        stale: true,
        total: filtered.length,
        warning: `Facebook API 限流，仅显示已缓存的 ${filtered.length} 个账户。请稍后点击刷新账户重试。`,
      });
      return;
    }

    res.status(502).json({
      error: fbErrorMessage(err),
      code: 'FB_API_ERROR',
    });
  }
});
