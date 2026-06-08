import { FacebookClient } from './facebookClient';
import { upsertFbAd } from '../models/fbAd';
import { extractPostIdFromStory, resolveStoryId } from '../utils/postId';

export class AdSyncService {
  private fbClient: FacebookClient;
  private accessToken: string;

  constructor(accessToken: string) {
    this.fbClient = FacebookClient.getInstance();
    this.accessToken = accessToken;
  }

  async syncAds(accountId: string, dateStart: string, dateEnd: string): Promise<{
    synced: number;
    withPostId: number;
    withoutPostId: number;
  }> {
    const cleanId = accountId.replace('act_', '');

    const [ads, adsets, insightRows] = await Promise.all([
      this.fbClient.getAllAds(cleanId, this.accessToken),
      this.fbClient.getAdSets(cleanId, this.accessToken, undefined, 500).then((r) => r.data || []),
      this.fbClient.getInsights(cleanId, this.accessToken, {
        level: 'ad',
        time_range: { since: dateStart, until: dateEnd },
        time_increment: 'all_days',
        limit: 500,
      }),
    ]);

    const budgetByAdset = new Map<string, number>();
    for (const adset of adsets) {
      const budget = parseFloat(adset.daily_budget || adset.lifetime_budget || '0') / 100;
      budgetByAdset.set(adset.id, budget);
    }

    const insightByAd = new Map<string, { spend: number; cpm: number; adName: string }>();
    for (const row of insightRows) {
      if (!row.ad_id) continue;
      const spend = parseFloat(row.spend || '0');
      const cpm = parseFloat(row.cpm || '0');
      const existing = insightByAd.get(row.ad_id);
      if (existing) {
        existing.spend += spend;
        if (cpm > 0) existing.cpm = cpm;
      } else {
        insightByAd.set(row.ad_id, {
          spend,
          cpm,
          adName: row.ad_name || row.ad_id,
        });
      }
    }

    let synced = 0;
    let withPostId = 0;
    let withoutPostId = 0;

    for (const ad of ads) {
      const storyId = resolveStoryId(ad.creative);
      const postId = extractPostIdFromStory(storyId);
      if (postId) withPostId++;
      else withoutPostId++;

      const metrics = insightByAd.get(ad.id);
      await upsertFbAd({
        adAccountId: cleanId,
        adId: ad.id,
        adName: ad.name || metrics?.adName || ad.id,
        postId,
        storyId,
        spend: metrics?.spend ?? 0,
        budget: budgetByAdset.get(ad.adset_id) ?? 0,
        cpm: metrics?.cpm ?? 0,
        dateStart,
        dateEnd,
      });
      synced++;
    }

    // insights 中有花费但 ads 列表未返回的广告
    for (const [adId, metrics] of insightByAd) {
      if (ads.some((ad: any) => ad.id === adId)) continue;
      await upsertFbAd({
        adAccountId: cleanId,
        adId,
        adName: metrics.adName,
        postId: null,
        storyId: null,
        spend: metrics.spend,
        budget: 0,
        cpm: metrics.cpm,
        dateStart,
        dateEnd,
      });
      synced++;
      withoutPostId++;
    }

    console.log(`[AdSync] account=${cleanId} synced=${synced} withPostId=${withPostId} withoutPostId=${withoutPostId}`);
    return { synced, withPostId, withoutPostId };
  }
}
