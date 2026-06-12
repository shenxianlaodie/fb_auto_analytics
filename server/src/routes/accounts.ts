import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { FacebookClient } from '../services/facebookClient';
import {
  getCachedAccountsForUser,
  propagateGlobalAccountsToUser,
  upsertAccountsForUser,
} from '../models/adAccount';
import { getUserById, touchAccountsSyncedAt } from '../models/user';
import { listTokens } from '../services/tokenPool';
import {
  isAccountRateLimit,
  isPermissionError,
  isRateLimitError,
  isTokenUnavailableError,
} from '../services/fbRateLimit';

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

function isRateLimitedError(err: any): boolean {
  return Boolean(err?.sawRateLimit) || isRateLimitError(err) || isAccountRateLimit(err);
}

function shouldTryNextToken(err: any): boolean {
  return (
    isRateLimitError(err) ||
    isAccountRateLimit(err) ||
    isPermissionError(err) ||
    isTokenUnavailableError(err)
  );
}

/** 轮换 Token 拉取广告账户列表 */
async function fetchAdAccountsRotating(primaryToken: string): Promise<any[]> {
  const fbClient = FacebookClient.getInstance();
  const now = new Date().toISOString();
  const tried = new Set<string>();
  let sawRateLimit = false;

  async function tryToken(token: string): Promise<any[]> {
    if (tried.has(token)) throw new Error('token already tried');
    tried.add(token);
    return fbClient.getAdAccounts(token);
  }

  function noteRateLimit(err: any): void {
    if (isRateLimitError(err) || isAccountRateLimit(err)) sawRateLimit = true;
  }

  function enrichError(err: any): any {
    if (sawRateLimit) err.sawRateLimit = true;
    return err;
  }

  try {
    return await tryToken(primaryToken);
  } catch (firstErr: any) {
    noteRateLimit(firstErr);
    if (!shouldTryNextToken(firstErr)) throw enrichError(firstErr);

    const pool = await listTokens();
    const candidates = pool.filter(
      (t) =>
        t.status === 'active' &&
        t.access_token !== primaryToken &&
        (!t.expires_at || t.expires_at > now) &&
        (!t.cooldown_until || t.cooldown_until < now)
    );

    let lastErr = firstErr;
    for (const t of candidates) {
      try {
        console.log(`[Accounts] Retrying me/adaccounts with token: ${t.name}`);
        return await tryToken(t.access_token);
      } catch (err: any) {
        lastErr = err;
        noteRateLimit(err);
        if (!shouldTryNextToken(err)) throw enrichError(err);
      }
    }
    throw enrichError(lastErr);
  }
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

  // 非主动刷新：有缓存就直接用，避免每次打开页面都打 me/adaccounts
  if (!forceRefresh && cached.length > 0) {
    const filtered = filterByPermission(cached, req.userRole!, req.userAllowedAccounts!);
    res.json({
      data: filtered,
      source: 'cache',
      total: filtered.length,
      stale: !cacheFresh,
    });
    return;
  }

  try {
    const accounts = await fetchAdAccountsRotating(req.accessToken!);
    await upsertAccountsForUser(req.userId!, accounts);
    await touchAccountsSyncedAt(req.userId!);
    console.log(`[Accounts] User ${req.userId} synced ${accounts.length} ad accounts from Facebook`);
    const filtered = filterByPermission(accounts, req.userRole!, req.userAllowedAccounts!);
    res.json({ data: filtered, source: 'facebook', total: filtered.length });
  } catch (err: any) {
    console.error('[Accounts] Facebook fetch failed:', fbErrorMessage(err));

    let workingCache = cached;
    if (forceRefresh) {
      const globalCount = await propagateGlobalAccountsToUser(req.userId!);
      if (globalCount > cached.length) {
        await touchAccountsSyncedAt(req.userId!);
        workingCache = await getCachedAccountsForUser(req.userId!);
        console.log(
          `[Accounts] User ${req.userId} merged global catalog: ${cached.length} -> ${workingCache.length}`
        );
      }
    }

    const filtered = filterByPermission(workingCache, req.userRole!, req.userAllowedAccounts!);
    if (filtered.length > 0) {
      const isLimited = isRateLimitedError(err);
      const mergedFromGlobal = workingCache.length > cached.length;
      res.json({
        data: filtered,
        source: mergedFromGlobal ? 'global_cache' : 'cache',
        stale: true,
        total: filtered.length,
        warning: isLimited
          ? mergedFromGlobal
            ? `Facebook API 暂时限流，已从系统账户目录补全到 ${filtered.length} 个账户。请稍后再点「刷新账户」与 Facebook 同步。`
            : `Facebook API 暂时限流，已显示本地缓存的 ${filtered.length} 个账户。请 10 分钟后再点「刷新账户」。`
          : mergedFromGlobal
            ? `无法连接 Facebook，已从系统账户目录补全到 ${filtered.length} 个账户（${fbErrorMessage(err)}）。`
            : `无法连接 Facebook，已显示本地缓存的 ${filtered.length} 个账户（${fbErrorMessage(err)}）。`,
      });
      return;
    }

    res.status(502).json({
      error: fbErrorMessage(err),
      code: 'FB_API_ERROR',
    });
  }
});
