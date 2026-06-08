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

// GET /api/accounts — 完整同步后 6h 内读库；否则拉取 Facebook（支持分页）
accountsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const forceRefresh = req.query.refresh === 'true';
  const user = await getUserById(req.userId!);
  const cached = await getCachedAccountsForUser(req.userId!);
  const cacheFresh = isCacheFresh(user?.accounts_synced_at);

  if (!forceRefresh && cached.length > 0 && cacheFresh) {
    res.json({ data: cached, source: 'cache', total: cached.length });
    return;
  }

  try {
    const fbClient = FacebookClient.getInstance();
    const accounts = await fbClient.getAdAccounts(req.accessToken!);
    await upsertAccountsForUser(req.userId!, accounts);
    await touchAccountsSyncedAt(req.userId!);
    console.log(`[Accounts] User ${req.userId} synced ${accounts.length} ad accounts from Facebook`);
    res.json({ data: accounts, source: 'facebook', total: accounts.length });
  } catch (err: any) {
    console.error('[Accounts] Facebook fetch failed:', fbErrorMessage(err));

    if (cached.length > 0) {
      res.json({
        data: cached,
        source: 'cache',
        stale: true,
        total: cached.length,
        warning: `Facebook API 限流，仅显示已缓存的 ${cached.length} 个账户。请稍后点击刷新账户重试。`,
      });
      return;
    }

    res.status(502).json({
      error: fbErrorMessage(err),
      code: 'FB_API_ERROR',
    });
  }
});
