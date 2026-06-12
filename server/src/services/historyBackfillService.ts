import { FacebookClient } from './facebookClient';
import { upsertFbAd } from '../models/fbAd';
import { getFbAdsMeta, getFbAdsets } from '../models/fbStructure';
import { query } from '../models/database';
import { getTokenForAccount } from './tokenPool';
import { isAccountInCooldown } from './fbRateLimit';
import { getUsageThrottleState } from './fbUsageMonitor';
import { isDormantAccount } from './accountDormantService';
import { sleep } from '../utils/sleep';

/**
 * 历史指标预回填：每日凌晨低峰期把过去 N 天的按天数据落库，
 * 白天用户切 7/30 天日期范围时纯读库、零 FB 调用。
 *
 * insights 用 time_increment=1 按段拉取：每段 1 次调用（含分页），
 * 返回「每广告 × 每天」一行，直接写入 fb_ads 单日行。
 */

const BACKFILL_DAYS = 30;
const SEGMENT_DAYS = 7;
const ACCOUNT_GAP_MS = 5000;
const SEGMENT_GAP_MS = 2000;

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function backfillAccount(accountId: string, days: number): Promise<number> {
  const cleanId = accountId.replace('act_', '');
  const accessToken = await getTokenForAccount(cleanId);
  const fbClient = FacebookClient.getInstance();

  const [metaList, adsetList] = await Promise.all([
    getFbAdsMeta(cleanId),
    getFbAdsets(cleanId),
  ]);
  const metaByAd = new Map(metaList.map((m) => [m.ad_id, m]));
  const budgetByAdset = new Map(
    adsetList.map((a) => [
      a.adset_id,
      parseFloat(a.daily_budget || a.lifetime_budget || '0') / 100,
    ])
  );

  let written = 0;
  // 从 days 天前回填到昨天（今天的数据由 5 分钟常规同步负责）
  for (let offset = days; offset >= 1; offset -= SEGMENT_DAYS) {
    const since = fmtDate(daysAgo(offset));
    const until = fmtDate(daysAgo(Math.max(1, offset - SEGMENT_DAYS + 1)));

    const rows = await fbClient.getInsights(cleanId, accessToken, {
      level: 'ad',
      time_range: { since, until },
      time_increment: 1,
      limit: 500,
    });

    for (const row of rows) {
      if (!row.ad_id || !row.date_start) continue;
      const meta = metaByAd.get(row.ad_id);
      await upsertFbAd({
        adAccountId: cleanId,
        adId: row.ad_id,
        adName: meta?.name || row.ad_name || row.ad_id,
        postId: meta?.post_id || null,
        storyId: meta?.story_id || null,
        spend: parseFloat(row.spend || '0'),
        budget: meta?.adset_id ? (budgetByAdset.get(meta.adset_id) ?? 0) : 0,
        cpm: parseFloat(row.cpm || '0'),
        dateStart: row.date_start,
        dateEnd: row.date_stop || row.date_start,
      });
      written++;
    }
    await sleep(SEGMENT_GAP_MS);
  }
  return written;
}

/** Cron：每日凌晨回填全部活跃账户的历史指标 */
export async function runHistoryBackfillCron(days: number = BACKFILL_DAYS): Promise<void> {
  const accounts = await query(
    `SELECT DISTINCT ad_account_id FROM fb_ads
     UNION SELECT DISTINCT ad_account_id FROM fb_campaigns
     UNION SELECT DISTINCT account_id AS ad_account_id FROM ad_accounts`
  );

  console.log(`[HistoryBackfill] start, accounts=${accounts.length}, days=${days}`);
  let ok = 0;
  let skipped = 0;

  for (const row of accounts) {
    const accountId = row.ad_account_id;
    if (!accountId) continue;
    const cleanId = String(accountId).replace('act_', '');

    if (
      isAccountInCooldown(cleanId) ||
      getUsageThrottleState(cleanId) === 'halt' ||
      (await isDormantAccount(cleanId))
    ) {
      skipped++;
      continue;
    }

    try {
      const written = await backfillAccount(cleanId, days);
      console.log(`[HistoryBackfill] account=${cleanId} rows=${written}`);
      ok++;
    } catch (err: any) {
      console.warn(`[HistoryBackfill] account=${cleanId} failed:`, err.message);
    }
    await sleep(ACCOUNT_GAP_MS);
  }

  console.log(`[HistoryBackfill] done, ok=${ok}, skipped=${skipped}`);
}
