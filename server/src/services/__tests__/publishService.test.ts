import { describe, expect, it, vi } from 'vitest';

vi.mock('../facebookClient', () => ({
  FacebookClient: { getInstance: vi.fn(() => ({})) },
}));

import {
  PublishPayload,
  buildAdParams,
  buildAdSetParams,
  buildCampaignParams,
  buildCreativeParams,
  buildTargeting,
} from '../publishService';

function basePayload(): PublishPayload {
  return {
    accountId: 'act_123',
    publishStatus: 'PAUSED',
    campaign: { name: '测试系列', cboEnabled: false, budgetType: 'daily' },
    adset: {
      name: '测试组',
      pixelId: 'px_1',
      conversionEvent: 'PURCHASE',
      budgetType: 'daily',
      budgetCents: 1000,
      countries: ['US', 'CA'],
      ageMin: 18,
      ageMax: 45,
      gender: 'all',
      interests: [],
      placementMode: 'auto',
    },
    ad: {
      name: '测试广告',
      pageId: 'page_1',
      format: 'image',
      imageHash: 'imghash',
      primaryText: '正文',
      headline: '标题',
      description: '描述',
      cta: 'SHOP_NOW',
      linkUrl: 'https://shop.example.com/p/1',
    },
  };
}

describe('buildCampaignParams', () => {
  it('非 CBO：固定销售目标，无预算字段', () => {
    const params = buildCampaignParams(basePayload());
    expect(params).toEqual({
      name: '测试系列',
      objective: 'OUTCOME_SALES',
      buying_type: 'AUCTION',
      special_ad_categories: [],
      status: 'PAUSED',
    });
  });

  it('CBO 日预算：预算与竞价策略在系列层', () => {
    const p = basePayload();
    p.campaign.cboEnabled = true;
    p.campaign.budgetCents = 5000;
    const params = buildCampaignParams(p);
    expect(params.daily_budget).toBe(5000);
    expect(params.bid_strategy).toBe('LOWEST_COST_WITHOUT_CAP');
    expect(params.lifetime_budget).toBeUndefined();
  });
});

describe('buildTargeting', () => {
  it('全部性别不传 genders；兴趣为空不传 flexible_spec；自动版位不传平台', () => {
    const t = buildTargeting(basePayload().adset);
    expect(t).toEqual({
      geo_locations: { countries: ['US', 'CA'] },
      age_min: 18,
      age_max: 45,
    });
  });

  it('女性 + 兴趣 + 手动平台', () => {
    const a = basePayload().adset;
    a.gender = 'female';
    a.interests = [{ id: '6003', name: 'Shopping' }];
    a.placementMode = 'manual';
    a.platforms = ['facebook', 'instagram'];
    const t = buildTargeting(a);
    expect(t.genders).toEqual([2]);
    expect(t.flexible_spec).toEqual([{ interests: [{ id: '6003', name: 'Shopping' }] }]);
    expect(t.publisher_platforms).toEqual(['facebook', 'instagram']);
  });
});

describe('buildAdSetParams', () => {
  it('非 CBO：组层日预算 + 像素转化目标', () => {
    const params = buildAdSetParams(basePayload(), 'camp_1');
    expect(params.campaign_id).toBe('camp_1');
    expect(params.daily_budget).toBe(1000);
    expect(params.optimization_goal).toBe('OFFSITE_CONVERSIONS');
    expect(params.billing_event).toBe('IMPRESSIONS');
    expect(params.promoted_object).toEqual({ pixel_id: 'px_1', custom_event_type: 'PURCHASE' });
    expect(params.bid_strategy).toBe('LOWEST_COST_WITHOUT_CAP');
  });

  it('CBO：组层无预算、无竞价策略；排期透传', () => {
    const p = basePayload();
    p.campaign.cboEnabled = true;
    p.adset.startTime = '2026-06-12T00:00:00+0800';
    p.adset.endTime = '2026-06-20T00:00:00+0800';
    const params = buildAdSetParams(p, 'camp_1');
    expect(params.daily_budget).toBeUndefined();
    expect(params.bid_strategy).toBeUndefined();
    expect(params.start_time).toBe('2026-06-12T00:00:00+0800');
    expect(params.end_time).toBe('2026-06-20T00:00:00+0800');
  });
});

describe('buildCreativeParams', () => {
  it('单图片创意：link_data + image_hash + CTA', () => {
    const params = buildCreativeParams(basePayload());
    expect(params.object_story_spec.page_id).toBe('page_1');
    expect(params.object_story_spec.link_data).toEqual({
      link: 'https://shop.example.com/p/1',
      message: '正文',
      name: '标题',
      description: '描述',
      image_hash: 'imghash',
      call_to_action: { type: 'SHOP_NOW', value: { link: 'https://shop.example.com/p/1' } },
    });
  });

  it('视频创意：video_data + 缩略图 hash', () => {
    const p = basePayload();
    p.ad.format = 'video';
    p.ad.videoId = 'vid_1';
    p.ad.thumbnailHash = 'thumbhash';
    const params = buildCreativeParams(p);
    expect(params.object_story_spec.video_data).toEqual({
      video_id: 'vid_1',
      image_hash: 'thumbhash',
      title: '标题',
      message: '正文',
      link_description: '描述',
      call_to_action: { type: 'SHOP_NOW', value: { link: 'https://shop.example.com/p/1' } },
    });
  });
});

describe('buildAdParams', () => {
  it('引用 adset 与 creative id', () => {
    expect(buildAdParams(basePayload(), 'as_1', 'cr_1')).toEqual({
      name: '测试广告',
      adset_id: 'as_1',
      creative: { creative_id: 'cr_1' },
      status: 'PAUSED',
    });
  });
});
