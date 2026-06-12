import { create } from 'zustand';

export interface WizardCampaign {
  name: string;
  cboEnabled: boolean;
  budgetType: 'daily' | 'lifetime';
  budgetUsd: number | null;
}

export interface WizardAdset {
  name: string;
  pixelId: string | null;
  conversionEvent: string;
  budgetType: 'daily' | 'lifetime';
  budgetUsd: number | null;
  startTime: string | null; // ISO
  endTime: string | null;
  countries: string[];
  ageMin: number;
  ageMax: number;
  gender: 'all' | 'male' | 'female';
  interests: { id: string; name: string }[];
  placementMode: 'auto' | 'manual';
  platforms: string[];
}

export interface WizardAd {
  name: string;
  pageId: string | null;
  format: 'image' | 'video';
  imageHash: string | null;
  imagePreviewUrl: string | null;     // 本地预览，不入草稿后无法恢复预览图
  videoId: string | null;
  thumbnailHash: string | null;
  thumbnailPreviewUrl: string | null;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  linkUrl: string;
}

interface WizardState {
  draftId: string | null;
  step: number; // 0=系列 1=组 2=广告
  campaign: WizardCampaign;
  adset: WizardAdset;
  ad: WizardAd;
  setStep: (s: number) => void;
  setDraftId: (id: string | null) => void;
  patchCampaign: (p: Partial<WizardCampaign>) => void;
  patchAdset: (p: Partial<WizardAdset>) => void;
  patchAd: (p: Partial<WizardAd>) => void;
  reset: () => void;
  loadDraft: (draftId: string, payload: any) => void;
}

const initialCampaign: WizardCampaign = {
  name: '', cboEnabled: false, budgetType: 'daily', budgetUsd: null,
};

const initialAdset: WizardAdset = {
  name: '', pixelId: null, conversionEvent: 'PURCHASE',
  budgetType: 'daily', budgetUsd: 10, startTime: null, endTime: null,
  countries: ['US'], ageMin: 18, ageMax: 65, gender: 'all',
  interests: [], placementMode: 'auto', platforms: ['facebook', 'instagram'],
};

const initialAd: WizardAd = {
  name: '', pageId: null, format: 'image',
  imageHash: null, imagePreviewUrl: null, videoId: null,
  thumbnailHash: null, thumbnailPreviewUrl: null,
  primaryText: '', headline: '', description: '', cta: 'SHOP_NOW', linkUrl: '',
};

export const useWizardStore = create<WizardState>((set) => ({
  draftId: null,
  step: 0,
  campaign: { ...initialCampaign },
  adset: { ...initialAdset },
  ad: { ...initialAd },

  setStep: (s) => set({ step: s }),
  setDraftId: (id) => set({ draftId: id }),
  patchCampaign: (p) => set((s) => ({ campaign: { ...s.campaign, ...p } })),
  patchAdset: (p) => set((s) => ({ adset: { ...s.adset, ...p } })),
  patchAd: (p) => set((s) => ({ ad: { ...s.ad, ...p } })),

  reset: () => set({
    draftId: null, step: 0,
    campaign: { ...initialCampaign },
    adset: { ...initialAdset },
    ad: { ...initialAd },
  }),

  loadDraft: (draftId, payload) => set({
    draftId,
    step: payload.step ?? 0,
    campaign: { ...initialCampaign, ...payload.campaign },
    adset: { ...initialAdset, ...payload.adset },
    ad: { ...initialAd, ...payload.ad },
  }),
}));

// --- 校验与 payload 构建（纯函数）---

export function validateStep(
  step: number,
  s: { campaign: WizardCampaign; adset: WizardAdset; ad: WizardAd },
): string[] {
  const errors: string[] = [];
  if (step === 0) {
    if (!s.campaign.name.trim()) errors.push('请输入广告系列名称');
    if (s.campaign.cboEnabled && (!s.campaign.budgetUsd || s.campaign.budgetUsd <= 0)) {
      errors.push('已开启预算优化，请输入系列预算');
    }
  }
  if (step === 1) {
    if (!s.adset.name.trim()) errors.push('请输入广告组名称');
    if (!s.adset.pixelId) errors.push('请选择像素');
    if (!s.campaign.cboEnabled && (!s.adset.budgetUsd || s.adset.budgetUsd <= 0)) {
      errors.push('请输入广告组预算');
    }
    const budgetType = s.campaign.cboEnabled ? s.campaign.budgetType : s.adset.budgetType;
    if (budgetType === 'lifetime' && !s.adset.endTime) errors.push('总预算模式必须设置结束时间');
    if (s.adset.countries.length === 0) errors.push('请至少选择一个投放国家/地区');
    if (s.adset.placementMode === 'manual' && s.adset.platforms.length === 0) {
      errors.push('手动版位至少勾选一个平台');
    }
  }
  if (step === 2) {
    if (!s.ad.name.trim()) errors.push('请输入广告名称');
    if (!s.ad.pageId) errors.push('请选择 Facebook 主页');
    if (s.ad.format === 'image' && !s.ad.imageHash) errors.push('请上传图片素材');
    if (s.ad.format === 'video') {
      if (!s.ad.videoId) errors.push('请上传视频素材');
      if (!s.ad.thumbnailHash) errors.push('请上传视频缩略图');
    }
    if (!s.ad.primaryText.trim()) errors.push('请输入主要文本');
    if (!s.ad.headline.trim()) errors.push('请输入标题');
    if (!/^https?:\/\/.+/.test(s.ad.linkUrl)) errors.push('请输入有效的落地页链接（http/https）');
  }
  return errors;
}

const usd2cents = (v: number | null) => (v ? Math.round(v * 100) : undefined);

/** 构建 POST /api/publish 请求体（与 server PublishPayload 对应） */
export function buildPublishBody(
  accountId: string,
  s: { campaign: WizardCampaign; adset: WizardAdset; ad: WizardAd },
  paused: boolean,
) {
  return {
    accountId,
    publishStatus: paused ? 'PAUSED' : 'ACTIVE',
    campaign: {
      name: s.campaign.name,
      cboEnabled: s.campaign.cboEnabled,
      budgetType: s.campaign.budgetType,
      budgetCents: usd2cents(s.campaign.budgetUsd),
    },
    adset: {
      name: s.adset.name,
      pixelId: s.adset.pixelId,
      conversionEvent: s.adset.conversionEvent,
      budgetType: s.adset.budgetType,
      budgetCents: usd2cents(s.adset.budgetUsd),
      startTime: s.adset.startTime || undefined,
      endTime: s.adset.endTime || undefined,
      countries: s.adset.countries,
      ageMin: s.adset.ageMin,
      ageMax: s.adset.ageMax,
      gender: s.adset.gender,
      interests: s.adset.interests,
      placementMode: s.adset.placementMode,
      platforms: s.adset.placementMode === 'manual' ? s.adset.platforms : undefined,
    },
    ad: {
      name: s.ad.name,
      pageId: s.ad.pageId,
      format: s.ad.format,
      imageHash: s.ad.imageHash || undefined,
      videoId: s.ad.videoId || undefined,
      thumbnailHash: s.ad.thumbnailHash || undefined,
      primaryText: s.ad.primaryText,
      headline: s.ad.headline,
      description: s.ad.description || undefined,
      cta: s.ad.cta,
      linkUrl: s.ad.linkUrl,
    },
  };
}

/** 草稿 payload：完整向导状态（预览 URL 为本地 blob 不保存） */
export function buildDraftPayload(s: {
  step: number; campaign: WizardCampaign; adset: WizardAdset; ad: WizardAd;
}) {
  return {
    step: s.step,
    campaign: s.campaign,
    adset: s.adset,
    ad: { ...s.ad, imagePreviewUrl: null, thumbnailPreviewUrl: null },
  };
}
