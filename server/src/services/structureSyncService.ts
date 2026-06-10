import { FacebookClient } from './facebookClient';
import {
  upsertFbCampaign,
  upsertFbAdset,
  upsertFbAdMeta,
} from '../models/fbStructure';
import { touchSyncState } from '../models/syncState';
import { extractPostIdFromStory, resolveStoryId } from '../utils/postId';
import { sleep } from '../utils/sleep';
import { recordStructureResult } from './accountDormantService';
import { refreshAccountTierCache } from './accountTierService';

const SERIAL_GAP_MS = 1000;
const PAGE_GAP_MS = 300;

/** 增量同步时回看重叠窗口，容忍时钟偏差/边界遗漏 */
const INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;

export interface StructureSyncOptions {
  /** 上次结构同步时间；提供时做增量拉取（updated_time 过滤） */
  sinceMs?: number;
}

function updatedTimeFilter(objectPrefix: string, sinceMs: number): string {
  const sinceUnix = Math.floor((sinceMs - INCREMENTAL_OVERLAP_MS) / 1000);
  return JSON.stringify([
    { field: `${objectPrefix}.updated_time`, operator: 'GREATER_THAN', value: sinceUnix },
  ]);
}

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
    dateEnd: string,
    options: StructureSyncOptions = {}
  ): Promise<{ campaigns: number; adsets: number; ads: number }> {
    const cleanId = accountId.replace('act_', '');
    const incremental = typeof options.sinceMs === 'number' && options.sinceMs > 0;

    const campaignParams = incremental
      ? { filtering: updatedTimeFilter('campaign', options.sinceMs!) }
      : undefined;
    const adsetParams = incremental
      ? { filtering: updatedTimeFilter('adset', options.sinceMs!) }
      : undefined;
    const adParams = incremental
      ? { filtering: updatedTimeFilter('ad', options.sinceMs!) }
      : undefined;

    const campaigns = await this.fbClient.getAllCampaigns(
      cleanId, this.accessToken, 200, 50, PAGE_GAP_MS, campaignParams
    );
    await sleep(SERIAL_GAP_MS);
    const adsets = await this.fbClient.getAllAdSets(
      cleanId, this.accessToken, 200, 50, PAGE_GAP_MS, adsetParams
    );
    await sleep(SERIAL_GAP_MS);
    const ads = await this.fbClient.getAllAds(
      cleanId, this.accessToken, {}, 100, 20, PAGE_GAP_MS, adParams
    );

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
    if (!incremental) {
      // 增量返回 0 不代表账户空，dormant 判定只看全量结果
      await recordStructureResult(cleanId, campaigns.length, adsets.length, ads.length);
      await refreshAccountTierCache(cleanId);
    }
    console.log(
      `[StructureSync] account=${cleanId} mode=${incremental ? 'incremental' : 'full'} ` +
      `campaigns=${campaigns.length} adsets=${adsets.length} ads=${ads.length}`
    );
    return { campaigns: campaigns.length, adsets: adsets.length, ads: ads.length };
  }
}
