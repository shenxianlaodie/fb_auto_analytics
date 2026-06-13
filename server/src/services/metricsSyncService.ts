import { FacebookClient } from './facebookClient';
import { deleteMultiDayFbAds, upsertFbAd } from '../models/fbAd';
import { getFbAdsMeta, getFbAdsets } from '../models/fbStructure';
import { touchSyncState } from '../models/syncState';
import { fetchAdInsightsWithSpend } from './spendInsightsHelper';

/** 仅拉取有 spend 的广告 insights，写入 fb_ads；状态/预算由结构同步负责 */
export class MetricsSyncService {
  private fbClient: FacebookClient;
  private accessToken: string;

  constructor(accessToken: string) {
    this.fbClient = FacebookClient.getInstance();
    this.accessToken = accessToken;
  }

  async syncMetrics(
    accountId: string,
    dateStart: string,
    dateEnd: string
  ): Promise<{ synced: number }> {
    const cleanId = accountId.replace('act_', '');

    const removed = await deleteMultiDayFbAds(cleanId);
    if (removed > 0) {
      console.log(`[MetricsSync] account=${cleanId} removed ${removed} legacy multi-day rows`);
    }

    const insightRows = await fetchAdInsightsWithSpend(
      this.fbClient,
      cleanId,
      this.accessToken,
      dateStart,
      dateEnd
    );

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

    let synced = 0;
    for (const row of insightRows) {
      const meta = metaByAd.get(row.ad_id);
      const budget = meta?.adset_id ? (budgetByAdset.get(meta.adset_id) ?? 0) : 0;
      const dayStart = row.date_start || dateStart;
      const dayEnd = row.date_stop || row.date_start || dateEnd;

      await upsertFbAd({
        adAccountId: cleanId,
        adId: row.ad_id,
        adName: meta?.name || row.ad_name || row.ad_id,
        postId: meta?.post_id || null,
        storyId: meta?.story_id || null,
        spend: row.spend,
        budget,
        cpm: row.cpm,
        dateStart: dayStart,
        dateEnd: dayEnd,
      });
      synced++;
    }

    await touchSyncState(cleanId, 'metrics', dateStart, dateEnd);
    console.log(`[MetricsSync] account=${cleanId} synced=${synced} (spend-only insights)`);
    return { synced };
  }
}
