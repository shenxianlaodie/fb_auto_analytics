import { getFbAdsByDateRange } from '../models/fbAd';
import { getFbCampaigns, getFbAdsets, getFbAdsMeta } from '../models/fbStructure';
import { getShoplazzaUtmForAccount } from '../models/shoplazzaUtm';
import { getLatestSyncMeta } from '../models/syncState';

interface RollupMetrics {
  spend: number;
  cpm: number;
  count: number;
}

/** 子级有一个 ACTIVE → ACTIVE；全部非 ACTIVE → PAUSED */
function rollupDeliveryStatus(statuses: Array<string | null | undefined>): string {
  const list = statuses.filter((s): s is string => !!s);
  if (list.length === 0) return 'PAUSED';
  return list.some((s) => s === 'ACTIVE') ? 'ACTIVE' : 'PAUSED';
}

function rollupFromAds(
  ads: Array<{ spend: number; cpm: number }>
): RollupMetrics {
  let spend = 0;
  let cpmSum = 0;
  let cpmCount = 0;
  for (const ad of ads) {
    spend += Number(ad.spend) || 0;
    if (ad.cpm > 0) {
      cpmSum += ad.cpm;
      cpmCount++;
    }
  }
  return {
    spend,
    cpm: cpmCount > 0 ? cpmSum / cpmCount : 0,
    count: ads.length,
  };
}

export class HierarchyService {
  async getHierarchyFromDb(
    accountId: string,
    dateStart: string,
    dateEnd: string,
    shopId?: string
  ) {
    const cleanId = accountId.replace('act_', '');

    const [campaigns, adsets, adsMeta, fbAds, utmRows, syncMeta] = await Promise.all([
      getFbCampaigns(cleanId),
      getFbAdsets(cleanId),
      getFbAdsMeta(cleanId),
      getFbAdsByDateRange(cleanId, dateStart, dateEnd),
      getShoplazzaUtmForAccount(cleanId, dateStart, dateEnd, shopId),
      getLatestSyncMeta(cleanId, dateStart, dateEnd, shopId || ''),
    ]);

    const metricsByAd = new Map(
      fbAds.map((a) => [a.ad_id, { spend: Number(a.spend), cpm: Number(a.cpm), budget: Number(a.budget) }])
    );
    const utmByAdId = new Map(
      utmRows
        .filter((r) => r.utm_value)
        .map((r) => [String(r.utm_value).trim(), r])
    );

    const ads = adsMeta.map((meta) => {
      const metrics = metricsByAd.get(meta.ad_id) || { spend: 0, cpm: 0, budget: 0 };
      const utmRow = utmByAdId.get(meta.ad_id);
      return {
        id: meta.ad_id,
        name: meta.name || meta.ad_id,
        adsetId: meta.adset_id,
        campaignId: meta.campaign_id,
        status: meta.status,
        creative: meta.creative,
        spend: metrics.spend,
        cpm: metrics.cpm,
        budget: metrics.budget,
        utmUv: utmRow?.uv ?? 0,
        utmAddToCart: utmRow?.add_to_cart ?? 0,
        utmBeginCheckout: utmRow?.begin_checkout ?? 0,
        utmOrders: utmRow?.orders ?? 0,
        utmSales: Number(utmRow?.sales) || 0,
        utmMatched: !!utmRow,
      };
    });

    const matchedCount = ads.filter((a) => a.utmMatched).length;

    const adsByAdset = new Map<string, typeof ads>();
    const adsByCampaign = new Map<string, typeof ads>();
    for (const ad of ads) {
      if (ad.adsetId) {
        if (!adsByAdset.has(ad.adsetId)) adsByAdset.set(ad.adsetId, []);
        adsByAdset.get(ad.adsetId)!.push(ad);
      }
      if (ad.campaignId) {
        if (!adsByCampaign.has(ad.campaignId)) adsByCampaign.set(ad.campaignId, []);
        adsByCampaign.get(ad.campaignId)!.push(ad);
      }
    }

    const adsetRows = adsets.map((a) => {
      const childAds = adsByAdset.get(a.adset_id) || [];
      const rollup = rollupFromAds(childAds);
      return {
        id: a.adset_id,
        name: a.name || a.adset_id,
        campaignId: a.campaign_id,
        status: rollupDeliveryStatus(childAds.map((ad) => ad.status)),
        daily_budget: a.daily_budget,
        lifetime_budget: a.lifetime_budget,
        spend: rollup.spend,
        cpm: rollup.cpm,
      };
    });

    const adsetStatusById = new Map(adsetRows.map((a) => [a.id, a.status]));

    const campaignRows = campaigns.map((c) => {
      const childAds = adsByCampaign.get(c.campaign_id) || [];
      const rollup = rollupFromAds(childAds);
      const childAdsetStatuses = adsets
        .filter((a) => a.campaign_id === c.campaign_id)
        .map((a) => adsetStatusById.get(a.adset_id) || 'PAUSED');
      return {
        id: c.campaign_id,
        name: c.name || c.campaign_id,
        objective: c.objective,
        status: rollupDeliveryStatus(childAdsetStatuses),
        daily_budget: c.daily_budget,
        lifetime_budget: c.lifetime_budget,
        spend: rollup.spend,
        cpm: rollup.cpm,
      };
    });

    return {
      campaigns: campaignRows,
      adsets: adsetRows,
      ads,
      meta: {
        ...syncMeta,
        matched: { total: ads.length, matched: matchedCount, unmatched: ads.length - matchedCount },
        shopId: shopId || null,
      },
    };
  }
}
