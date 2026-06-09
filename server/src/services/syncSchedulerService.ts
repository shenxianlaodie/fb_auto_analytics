import { query, queryOne } from '../models/database';
import { getSyncState, setRefreshing, touchSyncState } from '../models/syncState';
import { ShopCredential } from '../models/shopCredential';
import { ShopTokenService } from './shopTokenService';
import { StructureSyncService } from './structureSyncService';
import { MetricsSyncService } from './metricsSyncService';
import { UtmMatchService } from './utmMatchService';
import { todayDateRange } from '../utils/todayRange';
import { getActiveShopIds, isActiveShop } from './activeSyncRegistry';
import { isAccountInCooldown, isAccountRateLimit, markAccountCooldown } from './fbRateLimit';

/** 热路径（用户正在查看）：指标/UTM 约 2 分钟 */
const HOT_METRICS_TTL_MS = 2 * 60 * 1000;
const HOT_UTM_TTL_MS = 2 * 60 * 1000;
const HOT_STRUCTURE_TTL_MS = 30 * 60 * 1000;

/** 冷路径（后台 Cron）：指标 15 分钟、UTM 10 分钟、结构 6 小时 */
const COLD_METRICS_TTL_MS = 15 * 60 * 1000;
const COLD_UTM_TTL_MS = 10 * 60 * 1000;
const STRUCTURE_TTL_MS = 6 * 60 * 60 * 1000;

const SHOP_SYNC_GAP_MS = 800;
/** 账户间同步间隔：把一轮 Cron 的账户摊平，降低 Facebook 限流 burst */
const ACCOUNT_SYNC_GAP_MS = 1500;

const inflightAccounts = new Set<string>();
const inflightShops = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isStale(lastSyncedAt: string | null | undefined, ttlMs: number): boolean {
  if (!lastSyncedAt) return true;
  return Date.now() - new Date(lastSyncedAt).getTime() > ttlMs;
}

export interface RefreshInput {
  accountId: string;
  accountName?: string;
  dateStart: string;
  dateEnd: string;
  accessToken: string;
  shopId?: string;
  shopDomain?: string;
  force?: boolean;
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

async function runRefreshJob(input: RefreshInput): Promise<void> {
  const cleanId = input.accountId.replace('act_', '');

  if (!input.force && isAccountInCooldown(cleanId)) {
    console.log(`[SyncScheduler] account=${cleanId} 处于限流冷却中，跳过本次同步`);
    return;
  }

  console.log(`[SyncScheduler] refresh start account=${cleanId} ${input.dateStart}~${input.dateEnd} (hot)`);

  const [structureState, metricsState] = await Promise.all([
    getSyncState(cleanId, 'structure', input.dateStart, input.dateEnd),
    getSyncState(cleanId, 'metrics', input.dateStart, input.dateEnd),
  ]);

  const needStructure =
    input.force || isStale(structureState?.last_synced_at, HOT_STRUCTURE_TTL_MS);
  const needMetrics =
    input.force || isStale(metricsState?.last_synced_at, HOT_METRICS_TTL_MS);

  if (!needStructure && !needMetrics) {
    console.log(`[SyncScheduler] account=${cleanId} fb fresh, skip`);
    return;
  }

  // 指标优先：用户最关心 spend/cpm；结构同步失败不应阻塞指标入库
  let metricsOk = !needMetrics;
  let structureOk = !needStructure;
  let lastErr: any = null;

  if (needMetrics) {
    await setRefreshing(cleanId, 'metrics', input.dateStart, input.dateEnd, true);
    try {
      const metricsSync = new MetricsSyncService(input.accessToken);
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
      const structureSync = new StructureSyncService(input.accessToken);
      await structureSync.syncStructure(input.accountId, input.dateStart, input.dateEnd);
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

/** Cron：冷路径刷新 metrics；活跃账户用短 TTL */
export async function runMetricsCron(): Promise<void> {
  const users = await query(`SELECT id, access_token FROM users WHERE access_token IS NOT NULL`);
  if (users.length === 0) return;

  const { dateStart, dateEnd } = todayDateRange();
  const activeIds = new Set(
    (await import('./activeSyncRegistry')).getActiveAccountIds()
  );

  const accounts = await query(
    `SELECT DISTINCT ad_account_id FROM fb_ads
     UNION SELECT DISTINCT ad_account_id FROM fb_campaigns
     UNION SELECT DISTINCT account_id AS ad_account_id FROM ad_accounts`
  );

  // 先筛出本轮需要同步的账户，再均匀摊到时间窗内，避免 35 账户瞬间扎堆触发限流
  const due: Array<{ cleanId: string; hot: boolean }> = [];
  for (const row of accounts) {
    const accountId = row.ad_account_id;
    if (!accountId) continue;
    const cleanId = String(accountId).replace('act_', '');

    if (isAccountInCooldown(cleanId)) continue;

    const hot = activeIds.has(cleanId);
    const ttl = hot ? HOT_METRICS_TTL_MS : COLD_METRICS_TTL_MS;

    const state = await getSyncState(cleanId, 'metrics', dateStart, dateEnd);
    if (!isStale(state?.last_synced_at, ttl)) continue;

    due.push({ cleanId, hot });
  }

  if (due.length === 0) return;

  // 活跃账户优先；其余按账户间隔摊平
  due.sort((a, b) => (a.hot === b.hot ? 0 : a.hot ? -1 : 1));

  for (const { cleanId } of due) {
    const tokenRow = await query(
      `SELECT u.access_token FROM ad_accounts aa
       JOIN users u ON aa.user_id = u.id
       WHERE aa.account_id IN ($1, $2) LIMIT 1`,
      [cleanId, `act_${cleanId}`]
    );
    const token = tokenRow[0]?.access_token || users[0].access_token;

    enqueueRefresh({
      accountId: cleanId,
      dateStart,
      dateEnd,
      accessToken: token,
    });

    await sleep(ACCOUNT_SYNC_GAP_MS);
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

/** Cron：结构每 6 小时 */
export async function runStructureCron(): Promise<void> {
  const users = await query(`SELECT access_token FROM users WHERE access_token IS NOT NULL LIMIT 1`);
  if (users.length === 0) return;

  const { dateStart, dateEnd } = todayDateRange();

  const accounts = await query(`SELECT DISTINCT ad_account_id FROM fb_campaigns`);
  for (const row of accounts) {
    const cleanId = String(row.ad_account_id).replace('act_', '');

    if (isAccountInCooldown(cleanId)) continue;

    const state = await getSyncState(cleanId, 'structure', dateStart, dateEnd);
    if (!isStale(state?.last_synced_at, STRUCTURE_TTL_MS)) continue;

    enqueueRefresh({
      accountId: cleanId,
      dateStart,
      dateEnd,
      accessToken: users[0].access_token,
    });

    await sleep(ACCOUNT_SYNC_GAP_MS);
  }
}
