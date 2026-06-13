import { describe, expect, it } from 'vitest';
import {
  validateCreateAd,
  validateCreateAdSet,
  validatePublishPayload,
  validateUpdateAd,
} from '../adValidators';

describe('validateUpdateAd', () => {
  it('空 body 返回错误', () => {
    expect(validateUpdateAd({})).toBe('至少需提供 name 或 status');
  });

  it('仅 name 通过', () => {
    expect(validateUpdateAd({ name: '新名称' })).toBeNull();
  });

  it('仅 status PAUSED 通过', () => {
    expect(validateUpdateAd({ status: 'PAUSED' })).toBeNull();
  });

  it('非法 status 拒绝', () => {
    expect(validateUpdateAd({ status: 'ARCHIVED' })).toBe('status 必须为 ACTIVE 或 PAUSED');
  });
});

describe('validateCreateAd', () => {
  const valid = {
    accountId: 'act_1',
    adsetId: 'as_1',
    name: '测试广告',
    creative: {
      pageId: 'page_1',
      title: '标题',
      linkUrl: 'https://example.com',
      imageUrl: 'https://example.com/img.jpg',
    },
  };

  it('完整参数通过', () => {
    expect(validateCreateAd(valid)).toBeNull();
  });

  it('缺 pageId 拒绝', () => {
    expect(validateCreateAd({
      ...valid,
      creative: { ...valid.creative, pageId: undefined },
    })).toBe('缺少 pageId');
  });

  it('缺图片拒绝', () => {
    expect(validateCreateAd({
      ...valid,
      creative: { pageId: 'p1', title: 't', linkUrl: 'https://x.com' },
    })).toBe('需提供 imageHash 或 imageUrl');
  });
});

describe('validateCreateAdSet', () => {
  it('完整参数通过', () => {
    expect(validateCreateAdSet({
      accountId: 'act_1',
      campaignId: 'c1',
      name: '组',
      targeting: { geo_locations: { countries: ['US'] } },
      budget: { daily: 1000 },
    })).toBeNull();
  });

  it('缺 budget 拒绝', () => {
    expect(validateCreateAdSet({
      accountId: 'act_1',
      campaignId: 'c1',
      name: '组',
      targeting: {},
    })).toBe('缺少 budget');
  });
});

describe('validatePublishPayload', () => {
  const valid = {
    accountId: 'act_1',
    campaign: { name: '系列' },
    adset: { name: '组', pixelId: 'px_1' },
    ad: { name: '广告', pageId: 'page_1' },
  };

  it('完整参数通过', () => {
    expect(validatePublishPayload(valid)).toBeNull();
  });

  it('缺 pixelId 拒绝', () => {
    expect(validatePublishPayload({
      ...valid,
      adset: { name: '组' },
    })).toBe('缺少 pixelId');
  });

  it('缺 pageId 拒绝', () => {
    expect(validatePublishPayload({
      ...valid,
      ad: { name: '广告' },
    })).toBe('缺少 pageId');
  });
});
