import { FacebookClient } from './facebookClient';
import {
  upsertFbCampaign,
  upsertFbAdset,
  upsertFbAdMeta,
  updateFbCampaignStatus,
  updateFbAdsetStatus,
  updateFbAdMetaStatus,
} from '../models/fbStructure';
import { touchSyncState } from '../models/syncState';
import { extractPostIdFromStory, resolveStoryId } from '../utils/postId';

export class StructureSyncService {
  private fbClient: FacebookClient;
  private accessToken: string;

  constructor(accessToken: string) {
    this.fbClient = FacebookClient.getInstance();
    this.accessToken = accessToken;
  }

  async syncStructure(
    accountId: string,
    dateStart: string,
    dateEnd: string
  ): Promise<{ campaigns: number; adsets: number; ads: number }> {
    const cleanId = accountId.replace('act_', '');

    const [campaigns, adsets, ads] = await Promise.all([
      this.fbClient.getCampaigns(cleanId, this.accessToken, 500).then((r) => r.data || []),
      this.fbClient.getAdSets(cleanId, this.accessToken, undefined, 500).then((r) => r.data || []),
      this.fbClient.getAllAds(cleanId, this.accessToken),
    ]);

    for (const c of campaigns) {
      await upsertFbCampaign({
        adAccountId: cleanId,
        campaignId: c.id,
        name: c.name || null,
        status: c.status || null,
        objective: c.objective || null,
        dailyBudget: c.daily_budget || null,
        lifetimeBudget: c.lifetime_budget || null,
      });
    }

    const budgetByAdset = new Map<string, number>();
    for (const a of adsets) {
      await upsertFbAdset({
        adAccountId: cleanId,
        adsetId: a.id,
        campaignId: a.campaign_id || null,
        name: a.name || null,
        status: a.status || null,
        dailyBudget: a.daily_budget || null,
        lifetimeBudget: a.lifetime_budget || null,
      });
      budgetByAdset.set(a.id, parseFloat(a.daily_budget || a.lifetime_budget || '0') / 100);
    }

    for (const ad of ads) {
      const storyId = resolveStoryId(ad.creative);
      const postId = extractPostIdFromStory(storyId);
      await upsertFbAdMeta({
        adAccountId: cleanId,
        adId: ad.id,
        adsetId: ad.adset_id || null,
        campaignId: ad.campaign_id || null,
        name: ad.name || null,
        status: ad.status || null,
        creative: ad.creative || null,
        postId,
        storyId,
      });
    }

    await touchSyncState(cleanId, 'structure', dateStart, dateEnd);
    console.log(`[StructureSync] account=${cleanId} campaigns=${campaigns.length} adsets=${adsets.length} ads=${ads.length}`);
    return { campaigns: campaigns.length, adsets: adsets.length, ads: ads.length };
  }

  /** 随 metrics 同步：仅刷新投放状态（3 次轻量 FB 请求） */
  async syncDeliveryStatus(accountId: string): Promise<{ campaigns: number; adsets: number; ads: number }> {
    const cleanId = accountId.replace('act_', '');

    const [campaigns, adsets, ads] = await Promise.all([
      this.fbClient.getAllCampaignStatuses(cleanId, this.accessToken),
      this.fbClient.getAllAdSetStatuses(cleanId, this.accessToken),
      this.fbClient.getAllAdStatuses(cleanId, this.accessToken),
    ]);

    await Promise.all([
      ...campaigns.map((c) => updateFbCampaignStatus(cleanId, c.id, c.status || null)),
      ...adsets.map((a) => updateFbAdsetStatus(cleanId, a.id, a.status || null)),
      ...ads.map((a) => updateFbAdMetaStatus(cleanId, a.id, a.status || null)),
    ]);

    console.log(
      `[StatusSync] account=${cleanId} campaigns=${campaigns.length} adsets=${adsets.length} ads=${ads.length}`
    );
    return { campaigns: campaigns.length, adsets: adsets.length, ads: ads.length };
  }
}
