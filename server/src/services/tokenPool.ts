import { query, queryOne } from '../models/database';
import { config } from '../config';
import axios from 'axios';

export interface PoolToken {
  id: string;
  name: string;
  access_token: string;
  owner_name: string | null;
  status: 'active' | 'cooling' | 'disabled' | 'expired';
  cooldown_until: string | null;
  expires_at: string | null;
  call_count: number;
  last_used_at: string | null;
}

const ROTATION_INTERVAL_MS = 120_000; // 每 2 分钟轮换
const COOLDOWN_MS = 600_000; // 限流后冷却 10 分钟

let currentTokenId: string | null = null;
let rotationStartedAt = 0;

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

// --- 核心：获取可用 Token ---

export async function getPoolToken(): Promise<string> {
  const now = new Date().toISOString();

  // 仍然在轮换周期内，继续用当前 Token
  if (currentTokenId && Date.now() - rotationStartedAt < ROTATION_INTERVAL_MS) {
    const current = await queryOne(
      `SELECT * FROM fb_token_pool WHERE id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > $2)`,
      [currentTokenId, now]
    );
    if (current) {
      await query(
        `UPDATE fb_token_pool SET call_count = call_count + 1, last_used_at = $1, updated_at = $1 WHERE id = $2`,
        [now, currentTokenId]
      );
      return (current as PoolToken).access_token;
    }
  }

  // 先清理已过期的 Token
  await query(
    `UPDATE fb_token_pool SET status = 'expired', updated_at = NOW() WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < $1`,
    [now]
  );

  // 轮换：取 active + 未冷却 + 未过期的 Token
  const token = await queryOne(
    `SELECT * FROM fb_token_pool
     WHERE status = 'active'
       AND (cooldown_until IS NULL OR cooldown_until < $1)
       AND (expires_at IS NULL OR expires_at > $1)
     ORDER BY last_used_at ASC NULLS FIRST
     LIMIT 1`,
    [now]
  );

  if (token) {
    const t = token as PoolToken;
    currentTokenId = t.id;
    rotationStartedAt = Date.now();
    await query(
      `UPDATE fb_token_pool SET call_count = call_count + 1, last_used_at = $1, updated_at = $1 WHERE id = $2`,
      [now, t.id]
    );
    console.log(`[TokenPool] Using: ${t.name} (owner: ${t.owner_name || 'N/A'}, calls: ${t.call_count + 1})`);
    return t.access_token;
  }

  // 池空，回退到系统 Token
  console.warn('[TokenPool] No available token, fallback to SYSTEM_FB_ACCESS_TOKEN');
  return config.system.fbAccessToken;
}

// --- 标记限流 ---

export async function markCurrentTokenCooling(): Promise<void> {
  if (!currentTokenId) return;
  const until = new Date(Date.now() + COOLDOWN_MS).toISOString();
  await query(
    `UPDATE fb_token_pool SET status = 'cooling', cooldown_until = $1, updated_at = $1 WHERE id = $2`,
    [until, currentTokenId]
  );
  console.warn(`[TokenPool] Token ${currentTokenId} cooling until ${until}`);

  setTimeout(async () => {
    try {
      await query(
        `UPDATE fb_token_pool SET status = 'active', cooldown_until = NULL, updated_at = NOW() WHERE id = $1 AND status = 'cooling'`,
        [currentTokenId]
      );
      console.log(`[TokenPool] Token ${currentTokenId} recovered from cooling`);
    } catch (e: any) {
      console.error('[TokenPool] Auto-recover error:', e.message);
    }
  }, COOLDOWN_MS);

  currentTokenId = null;
  rotationStartedAt = 0;
}

// --- CRUD ---

export async function addToken(name: string, accessToken: string, ownerName?: string, userId?: string): Promise<{ token: PoolToken; exchanged: boolean }> {
  let finalToken = accessToken;
  let expiresAt: string | null = null;
  let exchanged = false;

  // 尝试换长效 Token
  const result = await exchangeForLongLived(accessToken);
  if (result) {
    finalToken = result.token;
    expiresAt = new Date(Date.now() + result.expiresIn * 1000).toISOString();
    exchanged = true;
    console.log(`[TokenPool] Exchanged short token → long-lived (${Math.round(result.expiresIn / 86400)}d)`);
  } else {
    // 交换失败，假设原始 Token 65 天后过期（保守估计）
    expiresAt = new Date(Date.now() + 65 * 86400 * 1000).toISOString();
    console.log('[TokenPool] Using token as-is (exchange failed or not needed)');
  }

  const token = await queryOne(
    `INSERT INTO fb_token_pool (name, access_token, owner_name, expires_at, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
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

export async function listTokens(): Promise<PoolToken[]> {
  return query(
    `SELECT id, name, access_token, owner_name, status, cooldown_until, expires_at, call_count, last_used_at, created_at
     FROM fb_token_pool ORDER BY created_at DESC`
  );
}

/** 检查用户是否需要绑定 Facebook（是否有可用 Token） */
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

/** 用户已绑定的 Token 数量 */
export async function userTokenCount(userId: string): Promise<number> {
  const row = await queryOne(
    `SELECT COUNT(*) as cnt FROM fb_token_pool WHERE user_id = $1 AND status IN ('active','cooling')`,
    [userId]
  );
  return row ? parseInt(row.cnt, 10) : 0;
}

export async function getTokenStats(): Promise<any> {
  const tokens = await listTokens();
  const active = tokens.filter(t => t.status === 'active').length;
  const cooling = tokens.filter(t => t.status === 'cooling').length;
  const expired = tokens.filter(t => t.status === 'expired').length;
  const totalCalls = tokens.reduce((sum, t) => sum + (t.call_count || 0), 0);
  return { total: tokens.length, active, cooling, expired, totalCalls, tokens };
}
