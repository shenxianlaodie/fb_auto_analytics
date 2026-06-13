import { FacebookClient, FB_AD_LIST_FIELDS } from './facebookClient';
import {
  upsertFbCampaign,
  upsertFbAdset,
  upsertFbAdMeta,
} from '../models/fbStructure';
import { touchSyncState } from '../models/syncState';
import { extractPostIdFromStory, resolveStoryId } from '../utils/postId';
import { sleep } from '../utils/sleep';
import { refreshAccountTierCache } from './accountTierService';
import { fetchAdInsightsWithSpend } from './spendInsightsHelper';

const BATCH_GAP_MS = 300;

const AD_FIELDS = FB_AD_LIST_FIELDS;
const CAMPAIGN_FIELDS =
  'id,name,objective,status,daily_budget,lifetime_budget';
const ADSET_FIELDS =
  'id,name,campaign_id,status,daily_budget,lifetime_budget';

export interface StructureSyncOptions {
  /** @deprecated 已改为仅同步有花费广告，不再做全量增量 */
  sinceMs?: number;
}

export class StructureSyncService {
  private fbClient: FacebookClient;
  private accessToken: string;

  constructor(accessToken: string) {
    this.fbClient = FacebookClient.getInstance();
    this.accessToken = accessToken;
  }

  /** 仅同步当日有 spend 的广告及其所属 campaign/adset（insights + batch GET） */
  async syncStructure(
    accountId: string,
    dateStart: string,
    dateEnd: string,
    _options: StructureSyncOptions = {}
  ): Promise<{ campaigns: number; adsets: number; ads: number }> {
    const cleanId = accountId.replace('act_', '');

    const insightRows = await fetchAdInsightsWithSpend(
      this.fbClient,
      cleanId,
      this.accessToken,
      dateStart,
      dateEnd
    );

    if (insightRows.length === 0) {
      await touchSyncState(cleanId, 'structure', dateStart, dateEnd);
      console.log(
        `[StructureSync] account=${cleanId} mode=spend-only campaigns=0 adsets=0 ads=0 (无花费广告)`
      );
      return { campaigns: 0, adsets: 0, ads: 0 };
    }

    const adIds = [...new Set(insightRows.map((r) => r.ad_id))];
    const campaignIds = [
      ...new Set(insightRows.map((r) => r.campaign_id).filter(Boolean) as string[]),
    ];
    const adsetIds = [
      ...new Set(insightRows.map((r) => r.adset_id).filter(Boolean) as string[]),
    ];

    const insightByAd = new Map(insightRows.map((r) => [r.ad_id, r]));

    const [ads, campaigns, adsets] = await Promise.all([
      this.fbClient.batchGetByIds(
        this.accessToken,
        adIds.map((id) => ({ id, fields: AD_FIELDS })),
        BATCH_GAP_MS
      ),
      campaignIds.length > 0
        ? this.fbClient.batchGetByIds(
            this.accessToken,
            campaignIds.map((id) => ({ id, fields: CAMPAIGN_FIELDS })),
            BATCH_GAP_MS
          )
        : Promise.resolve([]),
      adsetIds.length > 0
        ? this.fbClient.batchGetByIds(
            this.accessToken,
            adsetIds.map((id) => ({ id, fields: ADSET_FIELDS })),
            BATCH_GAP_MS
          )
        : Promise.resolve([]),
    ]);

    await sleep(BATCH_GAP_MS);

    for (const c of campaigns) {
      if (!c?.id) continue;
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

    for (const a of adsets) {
      if (!a?.id) continue;
      await upsertFbAdset({
        adAccountId: cleanId,
        adsetId: a.id,
        campaignId: a.campaign_id || null,
        name: a.name || null,
        status: a.status || null,
        dailyBudget: a.daily_budget || null,
        lifetimeBudget: a.lifetime_budget || null,
      });
    }

    const fetchedAdIds = new Set<string>();
    for (const ad of ads) {
      if (!ad?.id) continue;
      fetchedAdIds.add(ad.id);
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

    // batch 未返回的广告，用 insights 最小字段兜底
    for (const row of insightRows) {
      if (fetchedAdIds.has(row.ad_id)) continue;
      await upsertFbAdMeta({
        adAccountId: cleanId,
        adId: row.ad_id,
        adsetId: row.adset_id || null,
        campaignId: row.campaign_id || null,
        name: row.ad_name || row.ad_id,
        status: null,
        creative: null,
        postId: null,
        storyId: null,
      });
    }

    await touchSyncState(cleanId, 'structure', dateStart, dateEnd);
    await refreshAccountTierCache(cleanId);

    console.log(
      `[StructureSync] account=${cleanId} mode=spend-only ` +
        `campaigns=${campaigns.length} adsets=${adsets.length} ads=${insightRows.length}`
    );
    return {
      campaigns: campaigns.length,
      adsets: adsets.length,
      ads: insightRows.length,
    };
  }
}
