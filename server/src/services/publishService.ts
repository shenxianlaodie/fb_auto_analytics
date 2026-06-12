import { FacebookClient } from './facebookClient';
import { upsertFbAdMeta, upsertFbAdset, upsertFbCampaign } from '../models/fbStructure';
import { fbErrorMessage } from '../utils/fbError';

// --- 类型 ---

export interface PublishPayload {
  accountId: string;
  publishStatus: 'PAUSED' | 'ACTIVE';
  campaign: {
    name: string;
    cboEnabled: boolean;
    budgetType: 'daily' | 'lifetime';
    budgetCents?: number;
  };
  adset: {
    name: string;
    pixelId: string;
    conversionEvent: string;
    budgetType: 'daily' | 'lifetime';
    budgetCents?: number;
    startTime?: string;
    endTime?: string;
    countries: string[];
    ageMin: number;
    ageMax: number;
    gender: 'all' | 'male' | 'female';
    interests: { id: string; name: string }[];
    placementMode: 'auto' | 'manual';
    platforms?: string[];
  };
  ad: {
    name: string;
    pageId: string;
    format: 'image' | 'video';
    imageHash?: string;
    videoId?: string;
    thumbnailHash?: string;
    primaryText: string;
    headline: string;
    description?: string;
    cta: string;
    linkUrl: string;
  };
}

export interface LevelResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface PublishResult {
  campaign: LevelResult;
  adset: LevelResult;
  ad: LevelResult;
}

// --- 纯函数：FB 参数构建 ---

export function buildCampaignParams(p: PublishPayload): Record<string, any> {
  const params: Record<string, any> = {
    name: p.campaign.name,
    objective: 'OUTCOME_SALES',
    buying_type: 'AUCTION',
    special_ad_categories: [],
    status: p.publishStatus,
  };
  if (p.campaign.cboEnabled && p.campaign.budgetCents) {
    if (p.campaign.budgetType === 'daily') params.daily_budget = p.campaign.budgetCents;
    else params.lifetime_budget = p.campaign.budgetCents;
    params.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
  }
  return params;
}

export function buildTargeting(a: PublishPayload['adset']): Record<string, any> {
  const targeting: Record<string, any> = {
    geo_locations: { countries: a.countries },
    age_min: a.ageMin,
    age_max: a.ageMax,
  };
  if (a.gender === 'male') targeting.genders = [1];
  if (a.gender === 'female') targeting.genders = [2];
  if (a.interests.length > 0) {
    targeting.flexible_spec = [
      { interests: a.interests.map((i) => ({ id: i.id, name: i.name })) },
    ];
  }
  if (a.placementMode === 'manual' && a.platforms?.length) {
    targeting.publisher_platforms = a.platforms;
  }
  return targeting;
}

export function buildAdSetParams(p: PublishPayload, campaignId: string): Record<string, any> {
  const a = p.adset;
  const params: Record<string, any> = {
    name: a.name,
    campaign_id: campaignId,
    status: p.publishStatus,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    promoted_object: { pixel_id: a.pixelId, custom_event_type: a.conversionEvent },
    targeting: buildTargeting(a),
  };
  if (!p.campaign.cboEnabled) {
    params.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
    if (a.budgetCents) {
      if (a.budgetType === 'daily') params.daily_budget = a.budgetCents;
      else params.lifetime_budget = a.budgetCents;
    }
  }
  if (a.startTime) params.start_time = a.startTime;
  if (a.endTime) params.end_time = a.endTime;
  return params;
}

export function buildCreativeParams(p: PublishPayload): Record<string, any> {
  const ad = p.ad;
  const cta = { type: ad.cta, value: { link: ad.linkUrl } };
  if (ad.format === 'video') {
    return {
      name: `${ad.name} - 创意`,
      object_story_spec: {
        page_id: ad.pageId,
        video_data: {
          video_id: ad.videoId,
          image_hash: ad.thumbnailHash,
          title: ad.headline,
          message: ad.primaryText,
          link_description: ad.description,
          call_to_action: cta,
        },
      },
    };
  }
  return {
    name: `${ad.name} - 创意`,
    object_story_spec: {
      page_id: ad.pageId,
      link_data: {
        link: ad.linkUrl,
        message: ad.primaryText,
        name: ad.headline,
        description: ad.description,
        image_hash: ad.imageHash,
        call_to_action: cta,
      },
    },
  };
}

export function buildAdParams(p: PublishPayload, adsetId: string, creativeId: string): Record<string, any> {
  return {
    name: p.ad.name,
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status: p.publishStatus,
  };
}

// --- 发布编排 ---

export class PublishService {
  private fb: FacebookClient;
  private token: string;

  constructor(accessToken: string) {
    this.fb = FacebookClient.getInstance();
    this.token = accessToken;
  }

  /** 串行创建完整链路，逐层捕获错误，已创建层级保留并写回本地库 */
  async publish(p: PublishPayload): Promise<PublishResult> {
    const acct = p.accountId.replace('act_', '');
    const result: PublishResult = {
      campaign: { success: false },
      adset: { success: false },
      ad: { success: false },
    };

    // 1. Campaign
    let campaignId: string;
    try {
      const c = await this.fb.createCampaign(acct, this.token, buildCampaignParams(p));
      campaignId = c.id;
      result.campaign = { success: true, id: c.id };
      await upsertFbCampaign({
        adAccountId: acct,
        campaignId: c.id,
        name: p.campaign.name,
        status: p.publishStatus,
        objective: 'OUTCOME_SALES',
        dailyBudget: p.campaign.cboEnabled && p.campaign.budgetType === 'daily' && p.campaign.budgetCents
          ? String(p.campaign.budgetCents) : null,
        lifetimeBudget: p.campaign.cboEnabled && p.campaign.budgetType === 'lifetime' && p.campaign.budgetCents
          ? String(p.campaign.budgetCents) : null,
      });
    } catch (err: any) {
      result.campaign = { success: false, error: fbErrorMessage(err) };
      return result;
    }

    // 2. AdSet
    let adsetId: string;
    try {
      const a = await this.fb.createAdSet(acct, this.token, buildAdSetParams(p, campaignId));
      adsetId = a.id;
      result.adset = { success: true, id: a.id };
      await upsertFbAdset({
        adAccountId: acct,
        adsetId: a.id,
        campaignId,
        name: p.adset.name,
        status: p.publishStatus,
        dailyBudget: !p.campaign.cboEnabled && p.adset.budgetType === 'daily' && p.adset.budgetCents
          ? String(p.adset.budgetCents) : null,
        lifetimeBudget: !p.campaign.cboEnabled && p.adset.budgetType === 'lifetime' && p.adset.budgetCents
          ? String(p.adset.budgetCents) : null,
      });
    } catch (err: any) {
      result.adset = { success: false, error: fbErrorMessage(err) };
      return result;
    }

    // 3. Creative + Ad
    try {
      const creative = await this.fb.createAdCreative(acct, this.token, buildCreativeParams(p));
      const ad = await this.fb.createAd(acct, this.token, buildAdParams(p, adsetId, creative.id));
      result.ad = { success: true, id: ad.id };
      await upsertFbAdMeta({
        adAccountId: acct,
        adId: ad.id,
        adsetId,
        campaignId,
        name: p.ad.name,
        status: p.publishStatus,
        creative: { id: creative.id },
        postId: null,
        storyId: null,
      });
    } catch (err: any) {
      result.ad = { success: false, error: fbErrorMessage(err) };
    }

    return result;
  }
}
