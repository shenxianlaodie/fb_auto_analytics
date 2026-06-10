import { getFbAdsByDateRange } from '../models/fbAd';
import { getFbCampaigns, getFbAdsets, getFbAdsMeta, FbAdMetaRecord } from '../models/fbStructure';
import { getShoplazzaUtmForAccount, getShoplazzaUtmCampaignRows, ShoplazzaUtmRecord } from '../models/shoplazzaUtm';
import { getLatestSyncMeta } from '../models/syncState';
import { todayDateRange } from '../utils/todayRange';

interface RollupMetrics {
  spend: number;
  cpm: number;
  count: number;
}

function isDeliveryActive(status: string | null | undefined): boolean {
  return status === 'ACTIVE';
}

/** 子级有一个 ACTIVE → ACTIVE；全部非 ACTIVE → PAUSED */
function rollupDeliveryStatus(statuses: Array<string | null | undefined>): string {
  const list = statuses.filter((s): s is string => !!s);
  if (list.length === 0) return 'PAUSED';
  return list.some((s) => s === 'ACTIVE') ? 'ACTIVE' : 'PAUSED';
}

/** 本级非 ACTIVE 时优先显示本级状态，否则按子级 rollup */
function resolveDisplayStatus(
  ownStatus: string | null | undefined,
  childStatuses: Array<string | null | undefined>
): string {
  if (ownStatus && !isDeliveryActive(ownStatus)) {
    return ownStatus;
  }
  return rollupDeliveryStatus(childStatuses);
}

function campaignClosedHint(campaignOwnStatus: string | null | undefined): string[] {
  return campaignOwnStatus && !isDeliveryActive(campaignOwnStatus) ? ['广告系列已关闭'] : [];
}

function adParentClosedHints(
  campaignOwnStatus: string | null | undefined,
  adsetOwnStatus: string | null | undefined
): string[] {
  const hints: string[] = [];
  if (campaignOwnStatus && !isDeliveryActive(campaignOwnStatus)) {
    hints.push('广告系列已关闭');
  }
  if (adsetOwnStatus && !isDeliveryActive(adsetOwnStatus)) {
    hints.push('广告组已关闭');
  }
  return hints;
}

function findUtmCampaignForAd(
  meta: FbAdMetaRecord,
  campaignRows: ShoplazzaUtmRecord[]
): ShoplazzaUtmRecord | undefined {
  const keys = [meta.post_id, meta.story_id]
    .filter((v): v is string => !!v)
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (keys.length === 0) return undefined;
  return campaignRows.find((row) => {
    const val = row.utm_value || '';
    return keys.some((k) => val.includes(k));
  });
}

function buildSyncWarnings(
  syncMeta: Awaited<ReturnType<typeof getLatestSyncMeta>>,
  dateStart: string,
  dateEnd: string,
  hasMetricsRows: boolean,
  shopId?: string
): string[] {
  const warnings: string[] = [];
  const { dateStart: today } = todayDateRange();
  const isToday = dateStart === today && dateEnd === today;
  const now = Date.now();

  if (!hasMetricsRows) {
    warnings.push('所选日期范围内暂无已入库的 Facebook 指标，请确认后台已同步或更换日期');
  }

  if (isToday) {
    if (!syncMeta.metricsSyncedAt) {
      warnings.push('今日 Facebook 指标尚未同步');
    } else if (now - new Date(syncMeta.metricsSyncedAt).getTime() > 20 * 60 * 1000) {
      warnings.push('Facebook 指标已超过 20 分钟未更新');
    }
    if (shopId) {
      if (!syncMeta.utmSyncedAt) {
        warnings.push('今日 Shoplazza UTM 尚未同步');
      } else if (now - new Date(syncMeta.utmSyncedAt).getTime() > 10 * 60 * 1000) {
        warnings.push('Shoplazza UTM 已超过 10 分钟未更新');
      }
    }
  } else {
    warnings.push('历史日期数据来自库内按日入库记录，若缺数据需等待后台补同步');
  }

  if (syncMeta.refreshing) {
    warnings.push('后台正在同步，数据可能稍后更新');
  }

  return warnings;
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

    const [campaigns, adsets, adsMeta, fbAds, utmRows, utmCampaignRows, syncMeta] = await Promise.all([
      getFbCampaigns(cleanId),
      getFbAdsets(cleanId),
      getFbAdsMeta(cleanId),
      getFbAdsByDateRange(cleanId, dateStart, dateEnd),
      getShoplazzaUtmForAccount(cleanId, dateStart, dateEnd, shopId),
      getShoplazzaUtmCampaignRows(dateStart, dateEnd, shopId),
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
      const utmCampaignRow = findUtmCampaignForAd(meta, utmCampaignRows);
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
        utmCampaign: utmCampaignRow?.utm_value ?? null,
      };
    });

    const matchedCount = ads.filter((a) => a.utmMatched).length;
    const adsWithSpend = ads.filter((a) => Number(a.spend) > 0);
    const totalSpend = adsWithSpend.reduce((s, a) => s + Number(a.spend), 0);

    const campaignOwnStatusById = new Map(
      campaigns.map((c) => [c.campaign_id, c.status])
    );
    const adsetOwnStatusById = new Map(
      adsets.map((a) => [a.adset_id, a.status])
    );

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
      const ownStatus = a.status;
      return {
        id: a.adset_id,
        name: a.name || a.adset_id,
        campaignId: a.campaign_id,
        ownStatus,
        status: resolveDisplayStatus(ownStatus, childAds.map((ad) => ad.status)),
        statusHints: a.campaign_id
          ? campaignClosedHint(campaignOwnStatusById.get(a.campaign_id))
          : [],
        daily_budget: a.daily_budget,
        lifetime_budget: a.lifetime_budget,
        spend: rollup.spend,
        cpm: rollup.cpm,
      };
    });

    // fb_adsets 不完整时，从广告元数据补全广告组（避免展开系列后下级为空）
    const knownAdsetIds = new Set(adsetRows.map((a) => a.id));
    const syntheticAdsets: typeof adsetRows = [];
    for (const [adsetId, childAds] of adsByAdset) {
      if (knownAdsetIds.has(adsetId)) continue;
      const rollup = rollupFromAds(childAds);
      const campaignId = childAds.find((ad) => ad.campaignId)?.campaignId ?? null;
      syntheticAdsets.push({
        id: adsetId,
        name: childAds[0]?.name ? `${childAds[0].name}（组）` : `广告组 ${String(adsetId).slice(-8)}`,
        campaignId,
        ownStatus: adsetOwnStatusById.get(adsetId) ?? null,
        status: resolveDisplayStatus(adsetOwnStatusById.get(adsetId), childAds.map((ad) => ad.status)),
        statusHints: campaignClosedHint(campaignId ? campaignOwnStatusById.get(campaignId) : null),
        daily_budget: null,
        lifetime_budget: null,
        spend: rollup.spend,
        cpm: rollup.cpm,
      });
      knownAdsetIds.add(adsetId);
    }

    const allAdsetRows = [...adsetRows, ...syntheticAdsets];

    const adsetStatusById = new Map(allAdsetRows.map((a) => [a.id, a.status]));

    const campaignRows = campaigns.map((c) => {
      const childAds = adsByCampaign.get(c.campaign_id) || [];
      const rollup = rollupFromAds(childAds);
      const childAdsetStatuses = allAdsetRows
        .filter((a) => a.campaignId === c.campaign_id)
        .map((a) => adsetStatusById.get(a.id) || 'PAUSED');
      const ownStatus = c.status;
      return {
        id: c.campaign_id,
        name: c.name || c.campaign_id,
        objective: c.objective,
        ownStatus,
        status: resolveDisplayStatus(ownStatus, childAdsetStatuses),
        daily_budget: c.daily_budget,
        lifetime_budget: c.lifetime_budget,
        spend: rollup.spend,
        cpm: rollup.cpm,
      };
    });

    const adsWithHints = ads.map((ad) => ({
      ...ad,
      ownStatus: ad.status,
      statusHints: adParentClosedHints(
        ad.campaignId ? campaignOwnStatusById.get(ad.campaignId) : null,
        ad.adsetId ? adsetOwnStatusById.get(ad.adsetId) : null
      ),
    }));

    return {
      campaigns: campaignRows,
      adsets: allAdsetRows,
      ads: adsWithHints,
      meta: {
        ...syncMeta,
        dateStart,
        dateEnd,
        timezone: 'UTC+8',
        syncWarnings: buildSyncWarnings(syncMeta, dateStart, dateEnd, fbAds.length > 0, shopId),
        matched: { total: ads.length, matched: matchedCount, unmatched: ads.length - matchedCount },
        spendSummary: {
          totalSpend: Math.round(totalSpend * 100) / 100,
          adsWithSpend: adsWithSpend.length,
          totalAds: ads.length,
          campaignsWithSpend: campaignRows.filter((c) => Number(c.spend) > 0).length,
          totalCampaigns: campaignRows.length,
        },
        shopId: shopId || null,
      },
    };
  }
}
