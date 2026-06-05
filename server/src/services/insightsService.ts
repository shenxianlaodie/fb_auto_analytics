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
    const campaigns = await this.getCampaignInsights(accountId, dateStart, dateEnd, limit);
    const adsets = await this.getAdSetInsights(accountId, undefined, dateStart, dateEnd, limit);
    const ads = await this.getAdInsights(accountId, undefined, dateStart, dateEnd, 500);
    return { campaigns, adsets, ads };
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
      insightType: 'campaigns',
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
    const cacheKey = `adsets_${campaignId || 'all'}`;
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
    const cacheKey = `ads_${adsetId || 'all'}`;
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

  private async fetchCampaignInsightsFromFB(cleanId: string, dateStart: string, dateEnd: string, limit: number) {
    const fromSnapshot = await this.trySnapshotFallback(cleanId, 'campaign', dateStart, dateEnd);
    if (fromSnapshot) return fromSnapshot;

    const allInsights = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'campaign',
      fields: 'campaign_id,campaign_name,objective,spend,impressions,clicks,reach,cpm,cpc,ctr,cost_per_action_type,actions,action_values,inline_link_clicks,unique_clicks,cost_per_unique_click,date_start,date_stop',
      time_range: { since: dateStart, until: dateEnd },
      time_increment: 1,
      limit: 500,
    });

    const insightMap = new Map<string, any[]>();
    const metaMap = new Map<string, any>();
    for (const row of allInsights) {
      const cid = row.campaign_id;
      if (!insightMap.has(cid)) insightMap.set(cid, []);
      insightMap.get(cid)!.push(row);
      if (!metaMap.has(cid)) {
        metaMap.set(cid, { id: cid, name: row.campaign_name, objective: row.objective });
      }
    }

    const campaignData: any[] = [];
    for (const [cid, meta] of metaMap) {
      const rows = insightMap.get(cid) || [];
      campaignData.push({
        ...meta,
        status: 'ACTIVE',
        ...this.aggregateDetailedData(rows),
      });
    }

    return campaignData.slice(0, limit);
  }

  private async fetchAdSetInsightsFromFB(
    cleanId: string, campaignId: string | undefined, start: string, end: string, limit: number
  ) {
    const fromSnapshot = await this.trySnapshotFallback(cleanId, 'adset', start, end);
    if (fromSnapshot) {
      return campaignId ? fromSnapshot.filter((a: any) => a.campaignId === campaignId) : fromSnapshot;
    }

    const allInsights = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'adset',
      fields: 'adset_id,adset_name,campaign_id,spend,impressions,clicks,reach,cpm,cpc,ctr,cost_per_action_type,actions,action_values,inline_link_clicks,unique_clicks,cost_per_unique_click,date_start,date_stop',
      time_range: { since: start, until: end },
      time_increment: 1,
      limit: 500,
    });

    const insightMap = new Map<string, any[]>();
    const metaMap = new Map<string, any>();
    for (const row of allInsights) {
      const aid = row.adset_id;
      if (!insightMap.has(aid)) insightMap.set(aid, []);
      insightMap.get(aid)!.push(row);
      if (!metaMap.has(aid)) {
        metaMap.set(aid, { id: aid, name: row.adset_name, campaignId: row.campaign_id });
      }
    }

    const adsetData: any[] = [];
    for (const [aid, meta] of metaMap) {
      if (campaignId && meta.campaignId !== campaignId) continue;
      const rows = insightMap.get(aid) || [];
      adsetData.push({
        ...meta,
        status: 'ACTIVE',
        ...this.aggregateDetailedData(rows),
      });
    }

    return adsetData.slice(0, limit);
  }

  private async fetchAdInsightsFromFB(
    cleanId: string, adsetId: string | undefined, start: string, end: string, limit: number
  ) {
    const fromSnapshot = await this.trySnapshotFallback(cleanId, 'ad', start, end);
    if (fromSnapshot) {
      return adsetId ? fromSnapshot.filter((a: any) => a.adsetId === adsetId) : fromSnapshot;
    }

    const allInsights = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'ad',
      fields: 'ad_id,ad_name,adset_id,campaign_id,spend,impressions,clicks,reach,cpm,cpc,ctr,cost_per_action_type,actions,action_values,inline_link_clicks,unique_clicks,cost_per_unique_click,date_start,date_stop',
      time_range: { since: start, until: end },
      time_increment: 1,
      limit: 500,
    });

    const insightMap = new Map<string, any[]>();
    const metaMap = new Map<string, any>();
    for (const row of allInsights) {
      const aid = row.ad_id;
      if (!insightMap.has(aid)) insightMap.set(aid, []);
      insightMap.get(aid)!.push(row);
      if (!metaMap.has(aid)) {
        metaMap.set(aid, {
          id: aid,
          name: row.ad_name,
          adsetId: row.adset_id,
          campaignId: row.campaign_id,
        });
      }
    }

    const adData: any[] = [];
    for (const [aid, meta] of metaMap) {
      if (adsetId && meta.adsetId !== adsetId) continue;
      const rows = insightMap.get(aid) || [];
      adData.push({
        ...meta,
        status: 'ACTIVE',
        ...this.aggregateDetailedData(rows),
      });
    }

    return adData.slice(0, limit);
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
