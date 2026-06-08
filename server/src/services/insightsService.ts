import { FacebookClient } from './facebookClient';
import { clearExpiredCache } from '../models/cachedInsight';
import { getWithSWR, persistInsight, CacheKey } from './insightCache';
import { getLatestSnapshots, snapshotToMetrics } from '../models/snapshot';

interface InsightDataPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  cpm: number;
  cpc: number;
  ctr: number;
  conversions: number;
  conversionValue: number;
  costPerConversion: number;
}

interface OverviewMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpm: number;
  cpc: number;
  conversions: number;
  costPerConversion: number;
  spendChange: number;
  impressionsChange: number;
  clicksChange: number;
  conversionsChange: number;
}

export class InsightsService {
  private fbClient: FacebookClient;
  private accessToken: string;

  constructor(accessToken: string) {
    this.fbClient = FacebookClient.getInstance();
    this.accessToken = accessToken;
  }

  async getDashboard(accountId: string, dateStart: string, dateEnd: string) {
    const overview = await this.getOverview(accountId, dateStart, dateEnd);
    const trends = await this.getTrends(accountId, dateStart, dateEnd);
    const campaigns = await this.getCampaignInsights(accountId, dateStart, dateEnd);
    return { overview, trends, campaigns };
  }

  async getHierarchy(
    accountId: string,
    dateStart: string,
    dateEnd: string,
    limit: number = 200
  ) {
    const cleanId = accountId.replace('act_', '');
    const key: CacheKey = {
      adAccountId: cleanId,
      insightType: 'hierarchy_v4',
      dateRangeStart: dateStart,
      dateRangeEnd: dateEnd,
    };

    return getWithSWR(
      key,
      () => this.fetchHierarchyFromFB(cleanId, dateStart, dateEnd, limit),
      async (data) => {
        if (this.hasAnyMetrics(data)) {
          await persistInsight(key, data);
        } else {
          console.warn('[Hierarchy] Skipping cache — no metrics data');
        }
      }
    );
  }

  async getOverview(accountId: string, dateStart: string, dateEnd: string): Promise<OverviewMetrics> {
    const cleanId = accountId.replace('act_', '');
    const key: CacheKey = {
      adAccountId: cleanId,
      insightType: 'overview',
      dateRangeStart: dateStart,
      dateRangeEnd: dateEnd,
    };

    return getWithSWR(
      key,
      () => this.fetchOverviewFromFB(cleanId, dateStart, dateEnd),
      (data) => persistInsight(key, data)
    );
  }

  async getCampaignInsights(accountId: string, dateStart: string, dateEnd: string, limit: number = 50) {
    const cleanId = accountId.replace('act_', '');
    const key: CacheKey = {
      adAccountId: cleanId,
      insightType: 'campaigns_v3',
      dateRangeStart: dateStart,
      dateRangeEnd: dateEnd,
    };

    return getWithSWR(
      key,
      () => this.fetchCampaignInsightsFromFB(cleanId, dateStart, dateEnd, limit),
      (data) => persistInsight(key, data)
    );
  }

  async getAdSetInsights(accountId: string, campaignId?: string, dateStart?: string, dateEnd?: string, limit: number = 200) {
    const cleanId = accountId.replace('act_', '');
    const start = dateStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = dateEnd || new Date().toISOString().split('T')[0];
    const cacheKey = `adsets_v3_${campaignId || 'all'}`;
    const key: CacheKey = {
      adAccountId: cleanId,
      insightType: cacheKey,
      dateRangeStart: start,
      dateRangeEnd: end,
    };

    return getWithSWR(
      key,
      () => this.fetchAdSetInsightsFromFB(cleanId, campaignId, start, end, limit),
      (data) => persistInsight(key, data)
    );
  }

  async getAdInsights(accountId: string, adsetId?: string, dateStart?: string, dateEnd?: string, limit: number = 500) {
    const cleanId = accountId.replace('act_', '');
    const start = dateStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = dateEnd || new Date().toISOString().split('T')[0];
    const cacheKey = `ads_v3_${adsetId || 'all'}`;
    const key: CacheKey = {
      adAccountId: cleanId,
      insightType: cacheKey,
      dateRangeStart: start,
      dateRangeEnd: end,
    };

    return getWithSWR(
      key,
      () => this.fetchAdInsightsFromFB(cleanId, adsetId, start, end, limit),
      (data) => persistInsight(key, data)
    );
  }

  async getTrends(accountId: string, dateStart: string, dateEnd: string, breakdown: string = 'daily') {
    const cleanId = accountId.replace('act_', '');
    const key: CacheKey = {
      adAccountId: cleanId,
      insightType: 'trends',
      dateRangeStart: dateStart,
      dateRangeEnd: dateEnd,
      breakdown,
    };

    return getWithSWR(
      key,
      () => this.fetchTrendsFromFB(cleanId, dateStart, dateEnd, breakdown),
      (data) => persistInsight(key, data)
    );
  }

  // --- FB fetchers (only called on cache miss or background refresh) ---

  private async fetchOverviewFromFB(cleanId: string, dateStart: string, dateEnd: string): Promise<OverviewMetrics> {
    const currentData = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'account',
      time_range: { since: dateStart, until: dateEnd },
      time_increment: 'all_days',
    });

    const startDate = new Date(dateStart);
    const endDate = new Date(dateEnd);
    const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const prevStart = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const prevEnd = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);

    const prevData = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'account',
      time_range: {
        since: prevStart.toISOString().split('T')[0],
        until: prevEnd.toISOString().split('T')[0],
      },
      time_increment: 'all_days',
    });

    const current = this.aggregateData(currentData);
    const previous = this.aggregateData(prevData);

    clearExpiredCache(24).catch(() => {});

    return {
      spend: current.spend,
      impressions: current.impressions,
      clicks: current.clicks,
      reach: current.reach,
      ctr: current.ctr,
      cpm: current.cpm,
      cpc: current.cpc,
      conversions: current.conversions,
      costPerConversion: current.costPerConversion,
      spendChange: this.calcChange(current.spend, previous.spend),
      impressionsChange: this.calcChange(current.impressions, previous.impressions),
      clicksChange: this.calcChange(current.clicks, previous.clicks),
      conversionsChange: this.calcChange(current.conversions, previous.conversions),
    };
  }

  private buildInsightMap(rows: any[], idField: string): Map<string, any[]> {
    const map = new Map<string, any[]>();
    for (const row of rows) {
      const id = row[idField];
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(row);
    }
    if (rows.length > 0 && map.size === 0) {
      console.warn(`[Insights] ${rows.length} insight rows but none had ${idField}`);
    }
    return map;
  }

  private hasAnyMetrics(data: { campaigns?: any[]; adsets?: any[]; ads?: any[] }): boolean {
    const all = [...(data.campaigns || []), ...(data.adsets || []), ...(data.ads || [])];
    return all.some((r) => (r.spend ?? 0) > 0 || (r.impressions ?? 0) > 0);
  }

  private async safeFbCall<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      const fbMsg = err?.response?.data?.error?.error_user_msg || err.message;
      console.warn(`[Hierarchy] ${label} failed: ${fbMsg}`);
      return fallback;
    }
  }

  private async loadSnapshotMetrics(cleanId: string, since: string) {
    const [campaignSnaps, adsetSnaps, adSnaps] = await Promise.all([
      getLatestSnapshots(cleanId, 'campaign', since),
      getLatestSnapshots(cleanId, 'adset', since),
      getLatestSnapshots(cleanId, 'ad', since),
    ]);
    return {
      campaign: new Map(campaignSnaps.map((s) => [s.entity_id, snapshotToMetrics(s)])),
      adset: new Map(adsetSnaps.map((s) => [s.entity_id, snapshotToMetrics(s)])),
      ad: new Map(adSnaps.map((s) => [s.entity_id, snapshotToMetrics(s)])),
      campaignSnaps,
      adsetSnaps,
      adSnaps,
      count: campaignSnaps.length + adsetSnaps.length + adSnaps.length,
    };
  }

  private buildAdSetsFromInsights(rows: any[]): any[] {
    const map = new Map<string, any>();
    for (const row of rows) {
      if (!row.adset_id || map.has(row.adset_id)) continue;
      map.set(row.adset_id, {
        id: row.adset_id,
        name: row.adset_name || row.adset_id,
        campaign_id: row.campaign_id,
        status: 'ACTIVE',
      });
    }
    return Array.from(map.values());
  }

  private buildAdsFromInsights(rows: any[]): any[] {
    const map = new Map<string, any>();
    for (const row of rows) {
      if (!row.ad_id || map.has(row.ad_id)) continue;
      map.set(row.ad_id, {
        id: row.ad_id,
        name: row.ad_name || row.ad_id,
        adset_id: row.adset_id,
        campaign_id: row.campaign_id,
        status: 'ACTIVE',
      });
    }
    return Array.from(map.values());
  }

  /** Metadata + 1 insights call; falls back to DB snapshots when rate-limited */
  private async fetchHierarchyFromFB(cleanId: string, dateStart: string, dateEnd: string, limit: number) {
    const since = `${dateStart}T00:00:00.000Z`;

    const campaigns = (await this.safeFbCall(
      'getCampaigns',
      () => this.fbClient.getCampaigns(cleanId, this.accessToken, limit).then((r) => r.data || []),
      [] as any[]
    ));

    let adsets = await this.safeFbCall(
      'getAdSets',
      () => this.fbClient.getAdSets(cleanId, this.accessToken, undefined, limit).then((r) => r.data || []),
      [] as any[]
    );

    let ads = await this.safeFbCall(
      'getAds',
      () => this.fbClient.getAds(cleanId, this.accessToken, {}, 500).then((r) => r.data || []),
      [] as any[]
    );

    let adInsightRows = await this.safeFbCall(
      'adInsights',
      () => this.fbClient.getInsights(cleanId, this.accessToken, {
        level: 'ad',
        time_range: { since: dateStart, until: dateEnd },
        time_increment: 'all_days',
        limit: 500,
      }),
      [] as any[]
    );

    if (adsets.length === 0 && adInsightRows.length > 0) {
      adsets = this.buildAdSetsFromInsights(adInsightRows);
    }
    if (ads.length === 0 && adInsightRows.length > 0) {
      ads = this.buildAdsFromInsights(adInsightRows);
    }

    const snapshots = await this.loadSnapshotMetrics(cleanId, since);

    if (adsets.length === 0 && snapshots.adsetSnaps.length > 0) {
      adsets = snapshots.adsetSnaps.map((s) => ({
        id: s.entity_id,
        name: s.entity_name || s.entity_id,
        campaign_id: s.parent_id,
        status: 'ACTIVE',
      }));
    }
    if (ads.length === 0 && snapshots.adSnaps.length > 0) {
      ads = snapshots.adSnaps.map((s) => ({
        id: s.entity_id,
        name: s.entity_name || s.entity_id,
        adset_id: s.parent_id,
        status: 'ACTIVE',
      }));
    }

    console.log(`[Hierarchy] FB: ${campaigns.length} campaigns, ${adsets.length} adsets, ${ads.length} ads, ${adInsightRows.length} insight rows`);
    if (adInsightRows.length === 0 && snapshots.count > 0) {
      console.log(`[Hierarchy] Using snapshot fallback (${snapshots.count} rows)`);
    }

    const adMap = this.buildInsightMap(adInsightRows, 'ad_id');
    const adsetMap = this.buildInsightMap(adInsightRows, 'adset_id');
    const campaignMap = this.buildInsightMap(adInsightRows, 'campaign_id');

    const pickMetrics = (insightRows: any[] | undefined, snapMetrics: any | undefined) => {
      if (insightRows && insightRows.length > 0) return this.aggregateDetailedData(insightRows);
      if (snapMetrics) return snapMetrics;
      return this.aggregateDetailedData([]);
    };

    const result = {
      campaigns: campaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        objective: c.objective,
        status: c.status,
        daily_budget: c.daily_budget,
        lifetime_budget: c.lifetime_budget,
        ...pickMetrics(campaignMap.get(c.id), snapshots.campaign.get(c.id)),
      })),
      adsets: adsets.map((a: any) => ({
        id: a.id,
        name: a.name,
        campaignId: a.campaign_id,
        status: a.status,
        daily_budget: a.daily_budget,
        lifetime_budget: a.lifetime_budget,
        ...pickMetrics(adsetMap.get(a.id), snapshots.adset.get(a.id)),
      })),
      ads: ads.map((a: any) => ({
        id: a.id,
        name: a.name,
        adsetId: a.adset_id,
        campaignId: a.campaign_id,
        status: a.status,
        creative: a.creative,
        ...pickMetrics(adMap.get(a.id), snapshots.ad.get(a.id)),
      })),
    };

    if (!this.hasAnyMetrics(result) && campaigns.length === 0) {
      throw new Error('Facebook API 限流，暂时无法加载数据，请 5-10 分钟后重试');
    }

    return result;
  }

  private async fetchCampaignInsightsFromFB(cleanId: string, dateStart: string, dateEnd: string, limit: number) {
    const campaignsResp = await this.fbClient.getCampaigns(cleanId, this.accessToken, limit);
    const campaigns = campaignsResp.data || [];

    const snapshotMetrics = await this.trySnapshotFallback(cleanId, 'campaign', dateStart, dateEnd);
    if (snapshotMetrics) {
      const metricMap = new Map(snapshotMetrics.map((m: any) => [m.id, m]));
      return campaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        objective: c.objective,
        status: c.status,
        daily_budget: c.daily_budget,
        lifetime_budget: c.lifetime_budget,
        ...this.pickMetrics(metricMap.get(c.id)),
      }));
    }

    const allInsights = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'campaign',
      time_range: { since: dateStart, until: dateEnd },
      time_increment: 'all_days',
      limit: 500,
    });
    const insightMap = this.buildInsightMap(allInsights, 'campaign_id');
    console.log(`[Insights] Campaign: ${campaigns.length} entities, ${allInsights.length} insight rows, ${insightMap.size} matched`);

    return campaigns.map((c: any) => ({
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      daily_budget: c.daily_budget,
      lifetime_budget: c.lifetime_budget,
      ...this.aggregateDetailedData(insightMap.get(c.id) || []),
    }));
  }

  private async fetchAdSetInsightsFromFB(
    cleanId: string, campaignId: string | undefined, start: string, end: string, limit: number
  ) {
    const adsetsResp = await this.fbClient.getAdSets(cleanId, this.accessToken, campaignId, limit);
    const adsets = adsetsResp.data || [];

    const snapshotMetrics = await this.trySnapshotFallback(cleanId, 'adset', start, end);
    if (snapshotMetrics) {
      const metricMap = new Map(snapshotMetrics.map((m: any) => [m.id, m]));
      return adsets.map((a: any) => ({
        id: a.id,
        name: a.name,
        campaignId: a.campaign_id,
        status: a.status,
        daily_budget: a.daily_budget,
        lifetime_budget: a.lifetime_budget,
        ...this.pickMetrics(metricMap.get(a.id)),
      }));
    }

    const allInsights = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'adset',
      time_range: { since: start, until: end },
      time_increment: 'all_days',
      limit: 500,
    });
    const insightMap = this.buildInsightMap(allInsights, 'adset_id');

    return adsets.map((a: any) => ({
      id: a.id,
      name: a.name,
      campaignId: a.campaign_id,
      status: a.status,
      daily_budget: a.daily_budget,
      lifetime_budget: a.lifetime_budget,
      ...this.aggregateDetailedData(insightMap.get(a.id) || []),
    }));
  }

  private async fetchAdInsightsFromFB(
    cleanId: string, adsetId: string | undefined, start: string, end: string, limit: number
  ) {
    const adsResp = await this.fbClient.getAds(cleanId, this.accessToken, { adsetId }, limit);
    const ads = adsResp.data || [];

    const snapshotMetrics = await this.trySnapshotFallback(cleanId, 'ad', start, end);
    if (snapshotMetrics) {
      const metricMap = new Map(snapshotMetrics.map((m: any) => [m.id, m]));
      return ads.map((a: any) => ({
        id: a.id,
        name: a.name,
        adsetId: a.adset_id,
        campaignId: a.campaign_id,
        status: a.status,
        creative: a.creative,
        ...this.pickMetrics(metricMap.get(a.id)),
      }));
    }

    const allInsights = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'ad',
      time_range: { since: start, until: end },
      time_increment: 'all_days',
      limit: 500,
    });
    const insightMap = this.buildInsightMap(allInsights, 'ad_id');

    return ads.map((a: any) => ({
      id: a.id,
      name: a.name,
      adsetId: a.adset_id,
      campaignId: a.campaign_id,
      status: a.status,
      creative: a.creative,
      ...this.aggregateDetailedData(insightMap.get(a.id) || []),
    }));
  }

  /** Extract metric fields from a snapshot/cache row, stripping metadata keys */
  private pickMetrics(row: any | undefined) {
    if (!row) return this.aggregateDetailedData([]);
    const {
      id, name, status, objective, campaignId, adsetId, creative,
      daily_budget, lifetime_budget, campaign_id, adset_id, ...metrics
    } = row;
    return metrics;
  }

  private async fetchTrendsFromFB(cleanId: string, dateStart: string, dateEnd: string, breakdown: string) {
    const increment = breakdown === 'weekly' ? 7 : breakdown === 'monthly' ? 'all_days' : 1;
    const rawData = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'account',
      time_range: { since: dateStart, until: dateEnd },
      time_increment: increment,
    });

    return (rawData || []).map((row: any) => ({
      date: row.date_start,
      spend: parseFloat(row.spend || '0'),
      impressions: parseInt(row.impressions || '0'),
      clicks: parseInt(row.clicks || '0'),
      reach: parseInt(row.reach || '0'),
      cpm: parseFloat(row.cpm || '0'),
      cpc: parseFloat(row.cpc || '0'),
      ctr: parseFloat(row.ctr || '0'),
      conversions: this.extractConversions(row.actions),
      conversionValue: this.extractConversionValue(row.action_values),
      costPerConversion: parseFloat(row.cost_per_action_type?.[0]?.value || '0'),
    })) as InsightDataPoint[];
  }

  private async trySnapshotFallback(
    cleanId: string,
    level: 'campaign' | 'adset' | 'ad',
    dateStart: string,
    dateEnd: string
  ): Promise<any[] | null> {
    const today = new Date().toISOString().split('T')[0];
    if (dateStart !== today || dateEnd !== today) return null;

    const sinceHour = `${today}T00:00:00.000Z`;
    const rows = await getLatestSnapshots(cleanId, level, sinceHour);
    if (rows.length === 0) return null;

    console.log(`[Insights] Serving ${level} from snapshots (${rows.length} entities)`);

    return rows.map((row) => {
      const metrics = snapshotToMetrics(row);
      const base: any = {
        id: row.entity_id,
        name: row.entity_name || row.entity_id,
        status: 'ACTIVE',
        ...metrics,
      };
      if (level === 'adset') base.campaignId = row.parent_id;
      if (level === 'ad') base.adsetId = row.parent_id;
      return base;
    });
  }

  // --- Helpers ---

  private aggregateData(rows: any[]) {
    let spend = 0, impressions = 0, clicks = 0, reach = 0;
    let conversions = 0, conversionValue = 0;

    for (const row of rows) {
      spend += parseFloat(row.spend || '0');
      impressions += parseInt(row.impressions || '0');
      clicks += parseInt(row.clicks || '0');
      reach += parseInt(row.reach || '0');
      conversions += this.extractConversions(row.actions);
      conversionValue += this.extractConversionValue(row.action_values);
    }

    return {
      spend: Math.round(spend * 100) / 100,
      impressions,
      clicks,
      reach,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      cpm: impressions > 0 ? Math.round((spend / impressions) * 100000) / 100 : 0,
      cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
      conversions,
      conversionValue: Math.round(conversionValue * 100) / 100,
      costPerConversion: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
    };
  }

  private aggregateDetailedData(rows: any[]) {
    let spend = 0, impressions = 0, clicks = 0, reach = 0;
    let inlineLinkClicks = 0, uniqueClicks = 0;
    const actionValues: Record<string, number> = {};
    const actions: Record<string, number> = {};

    for (const row of rows) {
      spend += parseFloat(row.spend || '0');
      impressions += parseInt(row.impressions || '0');
      clicks += parseInt(row.clicks || '0');
      reach += parseInt(row.reach || '0');
      inlineLinkClicks += parseInt(row.inline_link_clicks || '0');
      uniqueClicks += parseInt(row.unique_clicks || '0');

      for (const av of (row.action_values || [])) {
        actionValues[av.action_type] = (actionValues[av.action_type] || 0) + parseFloat(av.value || '0');
      }
      for (const a of (row.actions || [])) {
        actions[a.action_type] = (actions[a.action_type] || 0) + parseInt(a.value || '0');
      }
    }

    const purchaseValue = actionValues['purchase'] || actionValues['offsite_conversion.fb_pixel_purchase'] || 0;
    const purchases = actions['purchase'] || actions['offsite_conversion.fb_pixel_purchase'] || 0;
    const addToCart = actions['add_to_cart'] || 0;
    const initiateCheckout = actions['initiate_checkout'] || 0;
    const addPaymentInfo = actions['add_payment_info'] || 0;

    return {
      spend: Math.round(spend * 100) / 100,
      impressions,
      clicks,
      reach,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      cpm: impressions > 0 ? Math.round((spend / impressions) * 100000) / 100 : 0,
      cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
      roas: spend > 0 ? Math.round((purchaseValue / spend) * 100) / 100 : 0,
      purchases,
      purchaseValue: Math.round(purchaseValue * 100) / 100,
      costPerPurchase: purchases > 0 ? Math.round((spend / purchases) * 100) / 100 : 0,
      inlineLinkClicks,
      uniqueClicks,
      costPerUniqueClick: uniqueClicks > 0 ? Math.round((spend / uniqueClicks) * 100) / 100 : 0,
      addToCart,
      costPerAddToCart: addToCart > 0 ? Math.round((spend / addToCart) * 100) / 100 : 0,
      initiateCheckout,
      costPerInitiateCheckout: initiateCheckout > 0 ? Math.round((spend / initiateCheckout) * 100) / 100 : 0,
      addPaymentInfo,
      costPerAddPaymentInfo: addPaymentInfo > 0 ? Math.round((spend / addPaymentInfo) * 100) / 100 : 0,
    };
  }

  private extractConversions(actions?: any[]): number {
    if (!actions) return 0;
    const conversionTypes = ['purchase', 'lead', 'complete_registration', 'add_to_cart', 'offsite_conversion'];
    return actions
      .filter((a: any) => conversionTypes.some((t) => a.action_type?.includes(t)))
      .reduce((sum: number, a: any) => sum + parseInt(a.value || '0'), 0);
  }

  private extractConversionValue(actionValues?: any[]): number {
    if (!actionValues) return 0;
    return actionValues.reduce((sum: number, a: any) => sum + parseFloat(a.value || '0'), 0);
  }

  private calcChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 10000) / 100;
  }
}
