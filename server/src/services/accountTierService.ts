import { query, queryOne } from '../models/database';

export type AccountTier = 'S' | 'M' | 'L' | 'empty';

const TIER_S_ADS = 500;
const TIER_M_ADS = 50;

/** 热路径 metrics TTL */
export function hotMetricsTtlMs(tier: AccountTier): number {
  if (tier === 'S') return 5 * 60 * 1000;
  if (tier === 'M') return 3 * 60 * 1000;
  return 2 * 60 * 1000;
}

/** 冷路径 metrics TTL（大账户保持 15 分钟） */
export function coldMetricsTtlMs(_tier: AccountTier): number {
  return 15 * 60 * 1000;
}

export function tierFromAdCount(adCount: number, campaignCount = 0): AccountTier {
  if (adCount === 0 && campaignCount === 0) return 'empty';
  if (adCount >= TIER_S_ADS) return 'S';
  if (adCount >= TIER_M_ADS) return 'M';
  return 'L';
}

export async function getAccountTier(accountId: string): Promise<AccountTier> {
  const cleanId = accountId.replace('act_', '');
  const row = await queryOne(
    `SELECT sync_tier, ad_count_cache FROM ad_accounts
     WHERE account_id IN ($1, $2) LIMIT 1`,
    [cleanId, `act_${cleanId}`]
  );
  if (row?.sync_tier && row.sync_tier !== 'auto') {
    return row.sync_tier as AccountTier;
  }

  const counts = await queryOne(
    `SELECT
       (SELECT COUNT(*)::int FROM fb_ads_meta WHERE ad_account_id = $1) AS ads,
       (SELECT COUNT(*)::int FROM fb_campaigns WHERE ad_account_id = $1) AS campaigns`,
    [cleanId]
  );
  const ads = counts?.ads ?? 0;
  const campaigns = counts?.campaigns ?? 0;
  return tierFromAdCount(ads, campaigns);
}

export async function refreshAccountTierCache(accountId: string): Promise<AccountTier> {
  const cleanId = accountId.replace('act_', '');
  const counts = await queryOne(
    `SELECT (SELECT COUNT(*)::int FROM fb_ads_meta WHERE ad_account_id = $1) AS ads`,
    [cleanId]
  );
  const ads = counts?.ads ?? 0;
  const campaignCounts = await queryOne(
    `SELECT (SELECT COUNT(*)::int FROM fb_campaigns WHERE ad_account_id = $1) AS campaigns`,
    [cleanId]
  );
  const tier = tierFromAdCount(ads, campaignCounts?.campaigns ?? 0);

  await query(
    `UPDATE ad_accounts SET ad_count_cache = $1
     WHERE account_id IN ($2, $3)`,
    [ads, cleanId, `act_${cleanId}`]
  ).catch(() => []);
  return tier;
}
