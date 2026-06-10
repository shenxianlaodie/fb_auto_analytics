import { query, queryOne } from '../models/database';
import { getSyncState, setRefreshing, touchSyncState } from '../models/syncState';
import { ShopCredential } from '../models/shopCredential';
import { StructureSyncService } from './structureSyncService';
import { MetricsSyncService } from './metricsSyncService';
import { UtmMatchService } from './utmMatchService';
import { todayDateRange } from '../utils/todayRange';
import { getActiveShopIds, isActiveShop } from './activeSyncRegistry';
import { isAccountInCooldown, isAccountRateLimit, markAccountCooldown } from './fbRateLimit';
import { getUsageThrottleState } from './fbUsageMonitor';
import { getTokenForAccount } from './tokenPool';
import { sleep } from '../utils/sleep';
import {
  coldMetricsTtlMs,
  getAccountTier,
  hotMetricsTtlMs,
} from './accountTierService';
import {
  isDormantAccount,
  shouldSkipStructure,
} from './accountDormantService';

const HOT_UTM_TTL_MS = 2 * 60 * 1000;
const HOT_STRUCTURE_TTL_MS = 5 * 60 * 1000;

const COLD_UTM_TTL_MS = 10 * 60 * 1000;
const STRUCTURE_TTL_MS = 15 * 60 * 1000;

const SHOP_SYNC_GAP_MS = 800;
const MIN_ACCOUNT_SYNC_GAP_MS = 3000;
const METRICS_CRON_WINDOW_MS = 14 * 60 * 1000;

const inflightAccounts = new Set<string>();
const inflightShops = new Set<string>();

function isStale(lastSyncedAt: string | null | undefined, ttlMs: number): boolean {
  if (!lastSyncedAt) return true;
  return Date.now() - new Date(lastSyncedAt).getTime() > ttlMs;
}

export type RefreshMode = 'hot' | 'cron-metrics' | 'cron-structure';

export interface RefreshInput {
  accountId: string;
  accountName?: string;
  dateStart: string;
  dateEnd: string;
  accessToken?: string;
  shopId?: string;
  shopDomain?: string;
  force?: boolean;
  mode?: RefreshMode;
  priority?: boolean;
}

function accountKey(accountId: string, dateStart: string, dateEnd: string): string {
  return `${accountId}:${dateStart}:${dateEnd}`;
}

function shopKey(shopId: string, dateStart: string, dateEnd: string): string {
  return `${shopId}:${dateStart}:${dateEnd}`;
}

/** 热路径：仅同步 Facebook 指标/结构，UTM 由店铺级任务负责 */
export async function enqueueRefresh(input: RefreshInput): Promise<void> {
  const key = accountKey(input.accountId, input.dateStart, input.dateEnd);
  if (inflightAccounts.has(key)) return;
  inflightAccounts.add(key);

  runRefreshJob(input)
    .catch((err) => console.error('[SyncScheduler] refresh failed:', err.message))
    .finally(() => inflightAccounts.delete(key));
}

/** 热路径：店铺全量 UTM 同步（与账户 refresh 解耦） */
export function enqueueShopUtmSync(
  shop: ShopCredential,
  dateStart: string,
  dateEnd: string,
  force = false
): void {
  const key = shopKey(shop.shopId, dateStart, dateEnd);
  if (inflightShops.has(key)) return;
  inflightShops.add(key);

  const ttl = isActiveShop(shop.shopId) ? HOT_UTM_TTL_MS : COLD_UTM_TTL_MS;

  void (async () => {
    try {
      const state = await getSyncState('', 'utm', dateStart, dateEnd, shop.shopId);
      if (!force && !isStale(state?.last_synced_at, ttl)) return;

      await setRefreshing('', 'utm', dateStart, dateEnd, true, shop.shopId);
      const utmMatch = new UtmMatchService();
      await utmMatch.syncShoplazzaUtm(shop, dateStart, dateEnd);
      await touchSyncState('', 'utm', dateStart, dateEnd, shop.shopId);
      console.log(`[ShopUtmSync] shop=${shop.shopDomain} done (hot=${isActiveShop(shop.shopId)})`);
    } catch (err: any) {
      console.warn(`[ShopUtmSync] shop=${shop.shopDomain} failed:`, err.message);
    } finally {
      await setRefreshing('', 'utm', dateStart, dateEnd, false, shop.shopId);
      inflightShops.delete(key);
    }
  })();
}

async function resolveAccessToken(accountId: string, provided?: string): Promise<string> {
  if (provided) return provided;
  return getTokenForAccount(accountId);
}

async function runRefreshJob(input: RefreshInput): Promise<void> {
  const cleanId = input.accountId.replace('act_', '');
  const mode = input.mode || 'hot';

  if (!input.force && isAccountInCooldown(cleanId)) {
    console.log(`[SyncScheduler] account=${cleanId} 处于限流冷却中，跳过本次同步`);
    return;
  }

  // 配额水位保护：>=95% 熔断（force 也不放行，避免耗尽最后额度触发真实限流）
  const throttle = getUsageThrottleState(cleanId);
  if (throttle === 'halt') {
    console.warn(`[SyncScheduler] account=${cleanId} 配额水位 >=95%，熔断本次同步`);
    return;
  }
  // >=80% 降频：同步 TTL 加倍
  const ttlScale = throttle === 'slow' ? 2 : 1;
  if (throttle === 'slow') {
    console.warn(`[SyncScheduler] account=${cleanId} 配额水位 >=80%，本轮降频（TTL x2）`);
  }

  const accessToken = await resolveAccessToken(cleanId, input.accessToken);

  const [structureState, metricsState] = await Promise.all([
    getSyncState(cleanId, 'structure', input.dateStart, input.dateEnd),
    getSyncState(cleanId, 'metrics', input.dateStart, input.dateEnd),
  ]);

  const tier = await getAccountTier(cleanId);
  const hotMetricsTtl = hotMetricsTtlMs(tier) * ttlScale;
  const coldMetricsTtl = coldMetricsTtlMs(tier) * ttlScale;
  const structureTtl = STRUCTURE_TTL_MS * ttlScale;
  const hotStructureTtl = HOT_STRUCTURE_TTL_MS * ttlScale;

  let needMetrics = false;
  let needStructure = false;

  if (mode === 'cron-metrics') {
    const dormant = await isDormantAccount(cleanId);
    const skipStructure = await shouldSkipStructure(cleanId, structureState?.last_synced_at);
    needMetrics = !dormant && (input.force || isStale(metricsState?.last_synced_at, coldMetricsTtl));
    needStructure =
      !skipStructure && (input.force || isStale(structureState?.last_synced_at, structureTtl));
  } else if (mode === 'cron-structure') {
    if (await shouldSkipStructure(cleanId, structureState?.last_synced_at)) {
      console.log(`[SyncScheduler] account=${cleanId} dormant，跳过 structure（24h 内已查）`);
      return;
    }
    needMetrics = false;
    needStructure = input.force || isStale(structureState?.last_synced_at, structureTtl);
  } else {
    needMetrics = input.force || isStale(metricsState?.last_synced_at, hotMetricsTtl);
    needStructure = input.force || isStale(structureState?.last_synced_at, hotStructureTtl);
  }

  if (!needMetrics && !needStructure) {
    console.log(`[SyncScheduler] account=${cleanId} fb fresh, skip`);
    return;
  }

  console.log(
    `[SyncScheduler] refresh start account=${cleanId} ${input.dateStart}~${input.dateEnd} (${mode})`
  );

  let metricsOk = !needMetrics;
  let structureOk = !needStructure;
  let lastErr: any = null;

  if (needMetrics) {
    await setRefreshing(cleanId, 'metrics', input.dateStart, input.dateEnd, true);
    try {
      const metricsSync = new MetricsSyncService(accessToken);
      await metricsSync.syncMetrics(input.accountId, input.dateStart, input.dateEnd);
      metricsOk = true;
    } catch (err: any) {
      lastErr = err;
      if (isAccountRateLimit(err)) markAccountCooldown(cleanId);
      console.error(`[SyncScheduler] metrics failed account=${cleanId}:`, err.message);
    } finally {
      await setRefreshing(cleanId, 'metrics', input.dateStart, input.dateEnd, false);
    }
  }

  if (needStructure) {
    await setRefreshing(cleanId, 'structure', input.dateStart, input.dateEnd, true);
    try {
      const structureSync = new StructureSyncService(accessToken);
      // 当天已有全量基线时走增量（updated_time 过滤）；每天首次同步自动全量兜底
      const sinceMs = structureState?.last_synced_at
        ? new Date(structureState.last_synced_at).getTime()
        : undefined;
      await structureSync.syncStructure(input.accountId, input.dateStart, input.dateEnd, { sinceMs });
      structureOk = true;
    } catch (err: any) {
      lastErr = err;
      if (isAccountRateLimit(err)) markAccountCooldown(cleanId);
      console.error(`[SyncScheduler] structure failed account=${cleanId}:`, err.message);
    } finally {
      await setRefreshing(cleanId, 'structure', input.dateStart, input.dateEnd, false);
    }
  }

  if (input.accountName) {
    await persistAdAccount(input);
  }

  console.log(
    `[SyncScheduler] refresh done account=${cleanId} metrics=${metricsOk} structure=${structureOk}`
  );

  if (!metricsOk && !structureOk && lastErr) {
    throw lastErr;
  }
}

async function persistAdAccount(input: RefreshInput): Promise<void> {
  const cleanId = input.accountId.replace('act_', '');
  const user = await queryOne(`SELECT id FROM users ORDER BY updated_at DESC LIMIT 1`);
  if (!user) return;

  const existing = await queryOne(
    `SELECT id FROM ad_accounts WHERE account_id IN ($1, $2) LIMIT 1`,
    [cleanId, `act_${cleanId}`]
  );
  if (existing) {
    await query(`UPDATE ad_accounts SET account_name = $1 WHERE id = $2`, [
      input.accountName,
      existing.id,
    ]);
    return;
  }
  await query(
    `INSERT INTO ad_accounts (user_id, account_id, account_name) VALUES ($1, $2, $3)`,
    [user.id, cleanId, input.accountName]
  );
}

/** Cron：冷路径刷新 metrics + structure（15 分钟 TTL）；活跃账户 metrics 用短 TTL */
export async function runMetricsCron(): Promise<void> {
  const poolCheck = await queryOne(
    `SELECT id FROM fb_token_pool WHERE status = 'active' LIMIT 1`
  );
  const userCheck = await queryOne(
    `SELECT access_token FROM users WHERE access_token IS NOT NULL LIMIT 1`
  );
  if (!poolCheck && !userCheck) return;

  const { dateStart, dateEnd } = todayDateRange();
  const activeIds = new Set(
    (await import('./activeSyncRegistry')).getActiveAccountIds()
  );

  const priorityRows = await query(
    `SELECT account_id FROM ad_accounts WHERE sync_priority = true`
  );
  const priorityIds = new Set(
    priorityRows.map((r: any) => String(r.account_id).replace('act_', ''))
  );

  const accounts = await query(
    `SELECT DISTINCT ad_account_id FROM fb_ads
     UNION SELECT DISTINCT ad_account_id FROM fb_campaigns
     UNION SELECT DISTINCT account_id AS ad_account_id FROM ad_accounts`
  );

  const due: Array<{ cleanId: string; hot: boolean; priority: boolean }> = [];
  for (const row of accounts) {
    const accountId = row.ad_account_id;
    if (!accountId) continue;
    const cleanId = String(accountId).replace('act_', '');

    if (isAccountInCooldown(cleanId)) continue;
    if (getUsageThrottleState(cleanId) === 'halt') {
      console.warn(`[MetricsCron] account=${cleanId} 配额水位 >=95%，熔断跳过`);
      continue;
    }

    const hot = activeIds.has(cleanId);
    const tier = await getAccountTier(cleanId);
    const ttl = hot ? hotMetricsTtlMs(tier) : coldMetricsTtlMs(tier);

    const [metricsState, structureState] = await Promise.all([
      getSyncState(cleanId, 'metrics', dateStart, dateEnd),
      getSyncState(cleanId, 'structure', dateStart, dateEnd),
    ]);
    const dormant = await isDormantAccount(cleanId);
    const skipStructure = await shouldSkipStructure(cleanId, structureState?.last_synced_at);
    const metricsDue = !dormant && isStale(metricsState?.last_synced_at, ttl);
    const structureDue =
      !skipStructure && isStale(structureState?.last_synced_at, STRUCTURE_TTL_MS);
    if (!metricsDue && !structureDue) continue;

    due.push({
      cleanId,
      hot,
      priority: priorityIds.has(cleanId) || hot,
    });
  }

  if (due.length === 0) return;

  due.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    if (a.hot !== b.hot) return a.hot ? -1 : 1;
    return 0;
  });

  const gap = Math.max(
    MIN_ACCOUNT_SYNC_GAP_MS,
    Math.floor(METRICS_CRON_WINDOW_MS / due.length)
  );

  for (const { cleanId } of due) {
    enqueueRefresh({
      accountId: cleanId,
      dateStart,
      dateEnd,
      mode: 'cron-metrics',
    });
    await sleep(gap);
  }
}

/** Cron：店铺全量 UTM；活跃店铺优先 + 间隔限流 */
export async function runShoplazzaCron(): Promise<void> {
  const { getActiveShopCredentials } = await import('../models/shopCredential');
  const shops = await getActiveShopCredentials();
  if (shops.length === 0) return;

  const { dateStart, dateEnd } = todayDateRange();
  const activeShopSet = new Set(getActiveShopIds());

  shops.sort((a, b) => {
    const aHot = activeShopSet.has(a.shopId) ? 0 : 1;
    const bHot = activeShopSet.has(b.shopId) ? 0 : 1;
    return aHot - bHot;
  });

  for (const shop of shops) {
    const ttl = activeShopSet.has(shop.shopId) ? HOT_UTM_TTL_MS : COLD_UTM_TTL_MS;
    try {
      const state = await getSyncState('', 'utm', dateStart, dateEnd, shop.shopId);
      if (!isStale(state?.last_synced_at, ttl)) continue;

      enqueueShopUtmSync(shop, dateStart, dateEnd);
    } catch (err: any) {
      console.warn(`[ShoplazzaCron] shop=${shop.shopDomain} failed:`, err.message);
    }
    await sleep(SHOP_SYNC_GAP_MS);
  }
}

