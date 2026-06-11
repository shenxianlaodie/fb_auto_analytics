import React from 'react';
import { Tag, Typography } from 'antd';

export interface UtmAggMetrics {
  spend: number;
  utmUv: number;
  utmOrders: number;
  utmSales: number;
  utmAddToCart: number;
  utmBeginCheckout: number;
}

export function aggregateAdsMetrics(ads: any[]): UtmAggMetrics {
  let spend = 0;
  let utmUv = 0;
  let utmOrders = 0;
  let utmSales = 0;
  let utmAddToCart = 0;
  let utmBeginCheckout = 0;
  for (const ad of ads) {
    spend += Number(ad.spend) || 0;
    utmUv += Number(ad.utmUv) || 0;
    utmOrders += Number(ad.utmOrders) || 0;
    utmSales += Number(ad.utmSales) || 0;
    utmAddToCart += Number(ad.utmAddToCart) || 0;
    utmBeginCheckout += Number(ad.utmBeginCheckout) || 0;
  }
  return { spend, utmUv, utmOrders, utmSales, utmAddToCart, utmBeginCheckout };
}

export function fmtCostPerUv(spend: number, uv: number): string {
  if (!uv || uv <= 0) return '-';
  return `$${(spend / uv).toFixed(2)}`;
}

export function fmtCostPerOrder(spend: number, orders: number): string {
  if (!orders || orders <= 0) return '-';
  return `$${(spend / orders).toFixed(2)}`;
}

export function fmtCostPerCount(spend: number, count: number): string {
  if (!count || count <= 0) return '-';
  return `$${(spend / count).toFixed(2)}`;
}

export function fmtRoas(sales: number, spend: number): string {
  if (!spend || spend <= 0) return '-';
  return (sales / spend).toFixed(2);
}

export function fmtOrders(orders: number): string {
  const n = Number(orders) || 0;
  return n > 0 ? String(n) : '-';
}

export function cmpStr(a: string, b: string): number {
  return (a || '').localeCompare(b || '', 'zh-CN');
}

export function cmpNum(a: number, b: number): number {
  return (a || 0) - (b || 0);
}

export function parseBudget(r: { daily_budget?: string; lifetime_budget?: string }): number {
  const b = r.daily_budget || r.lifetime_budget;
  return b ? parseInt(b, 10) / 100 : 0;
}

export function campaignIdOf(r: any): string {
  return r.campaignId || r.campaign_id;
}

export function adsetIdOf(r: any): string {
  return r.adsetId || r.adset_id;
}

export function adsForCampaign(campaignId: string, ads: any[]): any[] {
  return ads.filter((a) => campaignIdOf(a) === campaignId);
}

export function adsForAdset(adsetId: string, ads: any[]): any[] {
  return ads.filter((a) => adsetIdOf(a) === adsetId);
}

export function ownStatusOf(record: { ownStatus?: string | null; status: string }): string {
  return record.ownStatus ?? record.status;
}

export function renderStatusTag(status: string, level: 'campaign' | 'adset' | 'ad' = 'ad') {
  const pausedLabel = level === 'campaign' ? '已暂停' : '暂停';
  return (
    <Tag color={status === 'ACTIVE' ? 'green' : status === 'PAUSED' ? 'orange' : 'default'}>
      {status === 'ACTIVE' ? '投放中' : status === 'PAUSED' ? pausedLabel : status}
    </Tag>
  );
}

export function renderDeliveryStatusCell(
  record: { status: string; statusHints?: string[] },
  level: 'campaign' | 'adset' | 'ad' = 'ad',
) {
  return (
    <div>
      {renderStatusTag(record.status, level)}
      {record.statusHints?.map((hint) => (
        <div key={hint}>
          <Typography.Text type="warning" style={{ fontSize: 11, lineHeight: '16px' }}>
            {hint}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

/** 按广告编号（精确）/名称（模糊）过滤三层数据，命中下层自动带出上层 */
export function filterHierarchy(
  campaigns: any[],
  adsets: any[],
  ads: any[],
  searchAdId: string,
  searchName: string,
) {
  const adIdQ = searchAdId.trim().toLowerCase();
  const nameQ = searchName.trim().toLowerCase();

  if (!adIdQ && !nameQ) {
    return { campaigns, adsets, ads };
  }

  const campaignIds = new Set<string>();
  const adsetIds = new Set<string>();
  const adIds = new Set<string>();

  for (const c of campaigns) {
    const cid = c.id;
    const campaignNameMatch = nameQ && (c.name || '').toLowerCase().includes(nameQ);
    const childAdsets = adsets.filter((a) => campaignIdOf(a) === cid);

    if (campaignNameMatch) {
      campaignIds.add(cid);
      childAdsets.forEach((a) => adsetIds.add(a.id));
      adsForCampaign(cid, ads).forEach((a) => adIds.add(a.id));
      continue;
    }

    for (const adset of childAdsets) {
      const asid = adset.id;
      const adsetNameMatch = nameQ && (adset.name || '').toLowerCase().includes(nameQ);
      const adsInSet = adsForAdset(asid, ads);

      if (adsetNameMatch) {
        campaignIds.add(cid);
        adsetIds.add(asid);
        adsInSet.forEach((a) => adIds.add(a.id));
        continue;
      }

      for (const ad of adsInSet) {
        const adIdMatch = adIdQ && String(ad.id).toLowerCase() === adIdQ;
        const adNameMatch = nameQ && (ad.name || '').toLowerCase().includes(nameQ);
        if (adIdMatch || adNameMatch) {
          campaignIds.add(cid);
          adsetIds.add(asid);
          adIds.add(ad.id);
        }
      }
    }
  }

  return {
    campaigns: campaigns.filter((c) => campaignIds.has(c.id)),
    adsets: adsets.filter((a) => adsetIds.has(a.id)),
    ads: ads.filter((a) => adIds.has(a.id)),
  };
}
