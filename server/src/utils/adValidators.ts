export function validateUpdateAd(body: { name?: string; status?: string }): string | null {
  const { name, status } = body;
  if (!name && !status) return '至少需提供 name 或 status';
  if (status && !['ACTIVE', 'PAUSED'].includes(status)) return 'status 必须为 ACTIVE 或 PAUSED';
  return null;
}

export function validateCreateAd(body: {
  accountId?: string;
  adsetId?: string;
  name?: string;
  creative?: {
    pageId?: string;
    linkUrl?: string;
    title?: string;
    imageHash?: string;
    imageUrl?: string;
  };
}): string | null {
  const { accountId, adsetId, name, creative } = body;
  if (!accountId || !adsetId || !name) return '缺少 accountId、adsetId 或名称';
  if (!creative?.pageId) return '缺少 pageId';
  if (!creative?.linkUrl) return '缺少落地页链接';
  if (!creative?.title) return '缺少广告标题';
  if (!creative?.imageHash && !creative?.imageUrl) return '需提供 imageHash 或 imageUrl';
  return null;
}

export function validateCreateAdSet(body: {
  accountId?: string;
  campaignId?: string;
  name?: string;
  targeting?: unknown;
  budget?: unknown;
}): string | null {
  const { accountId, campaignId, name, targeting, budget } = body;
  if (!accountId || !campaignId || !name) return '缺少 accountId、campaignId 或名称';
  if (!targeting) return '缺少 targeting';
  if (!budget) return '缺少 budget';
  return null;
}

export function validatePublishPayload(payload: {
  accountId?: string;
  campaign?: { name?: string };
  adset?: { name?: string; pixelId?: string };
  ad?: { name?: string; pageId?: string };
}): string | null {
  if (!payload?.accountId || !payload?.campaign?.name || !payload?.adset?.name || !payload?.ad?.name) {
    return '发布数据不完整';
  }
  if (!payload?.adset?.pixelId) return '缺少 pixelId';
  if (!payload?.ad?.pageId) return '缺少 pageId';
  return null;
}
