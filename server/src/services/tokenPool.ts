import { query, queryOne } from '../models/database';
import { config } from '../config';
import axios from 'axios';
import { recordRateLimitEvent } from './fbRateLimitMonitor';

export interface PoolToken {
  id: string;
  name: string;
  access_token: string;
  owner_name: string | null;
  user_id: string | null;
  assigned_accounts: string[] | null;
  status: 'active' | 'cooling' | 'disabled' | 'expired';
  cooldown_until: string | null;
  expires_at: string | null;
  call_count: number;
  last_used_at: string | null;
}

const ROTATION_INTERVAL_MS = 300_000; // 每 5 分钟轮换
const COOLDOWN_MS = 600_000; // 限流后冷却 10 分钟

let webCurrentTokenId: string | null = null;
let webRotationStartedAt = 0;

let syncCurrentTokenId: string | null = null;
const syncTokenByAccount = new Map<string, string>();

function cleanAccountId(accountId: string): string {
  return accountId.replace('act_', '');
}

// --- Token 自动换长效 ---

async function exchangeForLongLived(shortToken: string): Promise<{ token: string; expiresIn: number } | null> {
  try {
    const resp = await axios.get(
      `https://graph.facebook.com/${config.facebook.apiVersion}/oauth/access_token`,
      {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: config.facebook.appId,
          client_secret: config.facebook.appSecret,
          fb_exchange_token: shortToken,
        },
        timeout: 10000,
      }
    );
    const { access_token, expires_in } = resp.data;
    if (access_token) {
      return { token: access_token, expiresIn: expires_in || 5184000 };
    }
    return null;
  } catch (err: any) {
    console.error('[TokenPool] Exchange failed:', err.response?.data || err.message);
    return null;
  }
}

async function pickAvailableToken(now: string): Promise<PoolToken | null> {
  await query(
    `UPDATE fb_token_pool SET status = 'expired', updated_at = NOW() WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < $1`,
    [now]
  );

  const token = await queryOne(
    `SELECT * FROM fb_token_pool
     WHERE status = 'active'
       AND (cooldown_until IS NULL OR cooldown_until < $1)
       AND (expires_at IS NULL OR expires_at > $1)
     ORDER BY last_used_at ASC NULLS FIRST
     LIMIT 1`,
    [now]
  );
  return token ? (token as PoolToken) : null;
}

async function touchTokenUsage(tokenId: string, tokenName: string, ownerName: string | null, callCount: number): Promise<void> {
  const now = new Date().toISOString();
  await query(
    `UPDATE fb_token_pool SET call_count = call_count + 1, last_used_at = $1, updated_at = $1 WHERE id = $2`,
    [now, tokenId]
  );
  console.log(`[TokenPool] Using: ${tokenName} (owner: ${ownerName || 'N/A'}, calls: ${callCount + 1})`);
}

function scheduleTokenRecover(tokenId: string): void {
  setTimeout(async () => {
    try {
      await query(
        `UPDATE fb_token_pool SET status = 'active', cooldown_until = NULL, updated_at = NOW() WHERE id = $1 AND status = 'cooling'`,
        [tokenId]
      );
      console.log(`[TokenPool] Token ${tokenId} recovered from cooling`);
    } catch (e: any) {
      console.error('[TokenPool] Auto-recover error:', e.message);
    }
  }, COOLDOWN_MS);
}

// --- 核心：获取可用 Token ---

/** Web 请求：轮换 Token */
export async function getPoolToken(): Promise<string> {
  const now = new Date().toISOString();

  if (webCurrentTokenId && Date.now() - webRotationStartedAt < ROTATION_INTERVAL_MS) {
    const current = await queryOne(
      `SELECT * FROM fb_token_pool WHERE id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > $2)`,
      [webCurrentTokenId, now]
    );
    if (current) {
      const t = current as PoolToken;
      await touchTokenUsage(t.id, t.name, t.owner_name, t.call_count);
      return t.access_token;
    }
  }

  const token = await pickAvailableToken(now);
  if (token) {
    webCurrentTokenId = token.id;
    webRotationStartedAt = Date.now();
    await touchTokenUsage(token.id, token.name, token.owner_name, token.call_count);
    return token.access_token;
  }

  console.warn('[TokenPool] No available token, fallback to SYSTEM_FB_ACCESS_TOKEN');
  return config.system.fbAccessToken;
}

/** 同步任务：按账户绑定 Token（方案 B 自动匹配 + assigned_accounts + 轮换兜底） */
export async function getTokenForAccount(accountId: string): Promise<string> {
  const cleanId = cleanAccountId(accountId);
  const now = new Date().toISOString();

  // 1. 显式绑定 assigned_accounts
  const bound = await queryOne(
    `SELECT * FROM fb_token_pool
     WHERE status = 'active'
       AND (cooldown_until IS NULL OR cooldown_until < $1)
       AND (expires_at IS NULL OR expires_at > $1)
       AND assigned_accounts @> $2::jsonb
     ORDER BY last_used_at ASC NULLS FIRST
     LIMIT 1`,
    [now, JSON.stringify([cleanId])]
  );
  if (bound) {
    const t = bound as PoolToken;
    syncCurrentTokenId = t.id;
    syncTokenByAccount.set(cleanId, t.id);
    await touchTokenUsage(t.id, t.name, t.owner_name, t.call_count);
    return t.access_token;
  }

  // 2. 方案 B：ad_accounts.user_id → fb_token_pool.user_id
  const ownerMatch = await queryOne(
    `SELECT tp.* FROM ad_accounts aa
     JOIN fb_token_pool tp ON tp.user_id = aa.user_id
     WHERE aa.account_id IN ($1, $2)
       AND tp.status = 'active'
       AND (tp.cooldown_until IS NULL OR tp.cooldown_until < $3)
       AND (tp.expires_at IS NULL OR tp.expires_at > $3)
     ORDER BY tp.last_used_at ASC NULLS FIRST
     LIMIT 1`,
    [cleanId, `act_${cleanId}`, now]
  );
  if (ownerMatch) {
    const t = ownerMatch as PoolToken;
    syncCurrentTokenId = t.id;
    syncTokenByAccount.set(cleanId, t.id);
    await touchTokenUsage(t.id, t.name, t.owner_name, t.call_count);
    return t.access_token;
  }

  // 3. 轮换兜底
  const token = await pickAvailableToken(now);
  if (token) {
    syncCurrentTokenId = token.id;
    syncTokenByAccount.set(cleanId, token.id);
    await touchTokenUsage(token.id, token.name, token.owner_name, token.call_count);
    return token.access_token;
  }

  console.warn(`[TokenPool] No token for account=${cleanId}, fallback to SYSTEM_FB_ACCESS_TOKEN`);
  return config.system.fbAccessToken;
}

async function markTokenCoolingById(tokenId: string): Promise<void> {
  const until = new Date(Date.now() + COOLDOWN_MS).toISOString();
  await query(
    `UPDATE fb_token_pool SET status = 'cooling', cooldown_until = $1, updated_at = $1 WHERE id = $2`,
    [until, tokenId]
  );
  console.warn(`[TokenPool] Token ${tokenId} cooling until ${until}`);
  recordRateLimitEvent('', 'token', `Token ${tokenId} 冷却至 ${until}`);
  scheduleTokenRecover(tokenId);

  if (webCurrentTokenId === tokenId) {
    webCurrentTokenId = null;
    webRotationStartedAt = 0;
  }
  if (syncCurrentTokenId === tokenId) {
    syncCurrentTokenId = null;
  }
  for (const [acct, tid] of syncTokenByAccount.entries()) {
    if (tid === tokenId) syncTokenByAccount.delete(acct);
  }
}

/** 应用级限流时冷却当前 Token */
export async function onAppRateLimitError(isSync: boolean): Promise<void> {
  const tokenId = isSync ? syncCurrentTokenId : webCurrentTokenId;
  if (tokenId) await markTokenCoolingById(tokenId);
}

export async function markCurrentTokenCooling(): Promise<void> {
  const tokenId = syncCurrentTokenId || webCurrentTokenId;
  if (!tokenId) return;
  await markTokenCoolingById(tokenId);
}

// --- CRUD ---

export async function addToken(name: string, accessToken: string, ownerName?: string, userId?: string): Promise<{ token: PoolToken; exchanged: boolean }> {
  let finalToken = accessToken;
  let expiresAt: string | null = null;
  let exchanged = false;

  const result = await exchangeForLongLived(accessToken);
  if (result) {
    finalToken = result.token;
    expiresAt = new Date(Date.now() + result.expiresIn * 1000).toISOString();
    exchanged = true;
    console.log(`[TokenPool] Exchanged short token → long-lived (${Math.round(result.expiresIn / 86400)}d)`);
  } else {
    expiresAt = new Date(Date.now() + 65 * 86400 * 1000).toISOString();
    console.log('[TokenPool] Using token as-is (exchange failed or not needed)');
  }

  const token = await queryOne(
    `INSERT INTO fb_token_pool (name, access_token, owner_name, expires_at, user_id, assigned_accounts) VALUES ($1, $2, $3, $4, $5, '[]'::jsonb) RETURNING *`,
    [name, finalToken, ownerName || null, expiresAt, userId || null]
  );

  return { token: token as PoolToken, exchanged };
}

export async function removeToken(id: string): Promise<void> {
  await query(`DELETE FROM fb_token_pool WHERE id = $1`, [id]);
}

export async function updateTokenStatus(id: string, status: string): Promise<void> {
  await query(
    `UPDATE fb_token_pool SET status = $1, cooldown_until = NULL, updated_at = NOW() WHERE id = $2`,
    [status, id]
  );
}

export async function updateTokenAssignments(id: string, assignedAccounts: string[]): Promise<void> {
  const cleaned = assignedAccounts.map(cleanAccountId);
  await query(
    `UPDATE fb_token_pool SET assigned_accounts = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(cleaned), id]
  );
}

export async function listTokens(): Promise<PoolToken[]> {
  return query(
    `SELECT id, name, access_token, owner_name, user_id, assigned_accounts, status, cooldown_until, expires_at, call_count, last_used_at, created_at
     FROM fb_token_pool ORDER BY created_at DESC`
  );
}

export async function userNeedsBind(userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const token = await queryOne(
    `SELECT id FROM fb_token_pool
     WHERE user_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > $2)
     LIMIT 1`,
    [userId, now]
  );
  return !token;
}

export async function userTokenCount(userId: string): Promise<number> {
  const row = await queryOne(
    `SELECT COUNT(*) as cnt FROM fb_token_pool WHERE user_id = $1 AND status IN ('active','cooling')`,
    [userId]
  );
  return row ? parseInt(row.cnt, 10) : 0;
}

export async function getTokenStats(): Promise<any> {
  const { getRecentRateLimitEvents } = await import('./fbRateLimitMonitor');
  const tokens = await listTokens();
  const active = tokens.filter((t) => t.status === 'active').length;
  const cooling = tokens.filter(t => t.status === 'cooling').length;
  const expired = tokens.filter(t => t.status === 'expired').length;
  const totalCalls = tokens.reduce((sum, t) => sum + (t.call_count || 0), 0);
  return {
    total: tokens.length,
    active,
    cooling,
    expired,
    totalCalls,
    tokens,
    recentRateLimits: getRecentRateLimitEvents(20),
  };
}
