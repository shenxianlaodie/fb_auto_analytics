import { FacebookClient } from './facebookClient';
import { getCachedInsight, setCachedInsight, clearExpiredCache } from '../models/cachedInsight';

// --- Cold/Hot Cache TTL ---
// Hot: today's data → 5 min TTL (data still changing)
// Warm: yesterday → 1 hour TTL
// Cold: older → 24 hour TTL (data is stable)

function getTTLHours(dateEnd: string): number {
  const today = new Date().toISOString().split('T')[0];
  const end = new Date(dateEnd);
  const now = new Date();
  const daysAgo = Math.floor((now.getTime() - end.getTime()) / (1000 * 60 * 60 * 24));
  if (dateEnd >= today) return 5 / 60;      // today: 5 min
  if (daysAgo <= 1) return 1;                // yesterday: 1 hour
  return 24;                                  // older: 24 hours
}

function isCacheFresh(cached: { created_at: string } | null, ttlHours: number): boolean {
  if (!cached) return false;
  const age = (Date.now() - new Date(cached.created_at).getTime()) / (1000 * 60 * 60);
  return age < ttlHours;
}

async function getOrClearCache(adAccountId: string, type: string, start: string, end: string, breakdown: string = ''): Promise<any | null> {
  const cached = await getCachedInsight(adAccountId, type, start, end, breakdown);
  const ttl = getTTLHours(end);
  if (isCacheFresh(cached, ttl)) {
    return JSON.parse(cached!.data);
  }
  return null; // stale or missing → refetch
}

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
  // Period-over-period comparison
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

  async getOverview(accountId: string, dateStart: string, dateEnd: string): Promise<OverviewMetrics> {
    const cleanId = accountId.replace('act_', '');

    // Check cold/hot cache first
    const cachedOverview = await getOrClearCache(cleanId, 'overview', dateStart, dateEnd);
    if (cachedOverview) return cachedOverview;

    // Current period
    const currentData = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'account',
      time_range: { since: dateStart, until: dateEnd },
      time_increment: 'all_days',
    });

    // Previous period (for comparison)
    const startDate = new Date(dateStart);
    const endDate = new Date(dateEnd);
    const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
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

    const result: OverviewMetrics = {
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

    // Cache the result
    setCachedInsight({
      adAccountId: cleanId,
      insightType: 'overview',
      dateRangeStart: dateStart,
      dateRangeEnd: dateEnd,
      jsonData: JSON.stringify(result),
    });

    // Clean old cache entries occasionally
    clearExpiredCache(24);

    return result;
  }

  async getCampaignInsights(accountId: string, dateStart: string, dateEnd: string, limit: number = 50) {
    const cleanId = accountId.replace('act_', '');

    const cachedCampaigns = await getOrClearCache(cleanId, 'campaigns', dateStart, dateEnd);
    if (cachedCampaigns) return cachedCampaigns;

    // Fetch campaigns metadata
    const campaignsResp = await this.fbClient.getCampaigns(cleanId, this.accessToken, limit);
    const campaigns = campaignsResp.data || [];

    // Fetch ALL campaign insights in ONE call
    const allInsights = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'campaign',
      time_range: { since: dateStart, until: dateEnd },
      time_increment: 1, // daily breakdown, we aggregate below
      limit: 500,
    });

    // Group insights by campaign_id
    const insightMap = new Map<string, any[]>();
    for (const row of allInsights) {
      const cid = row.campaign_id;
      if (!insightMap.has(cid)) insightMap.set(cid, []);
      insightMap.get(cid)!.push(row);
    }

    // Merge campaigns with their insights
    const campaignData: any[] = [];
    for (const campaign of campaigns) {
      const rows = insightMap.get(campaign.id) || [];
      const aggregated = this.aggregateDetailedData(rows);
      campaignData.push({
        id: campaign.id,
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status,
        daily_budget: campaign.daily_budget,
        lifetime_budget: campaign.lifetime_budget,
        ...aggregated,
      });
    }

    setCachedInsight({
      adAccountId: cleanId,
      insightType: 'campaigns',
      dateRangeStart: dateStart,
      dateRangeEnd: dateEnd,
      jsonData: JSON.stringify(campaignData),
    });

    return campaignData;
  }

  async getAdSetInsights(accountId: string, campaignId?: string, dateStart?: string, dateEnd?: string, limit: number = 200) {
    const cleanId = accountId.replace('act_', '');
    const start = dateStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = dateEnd || new Date().toISOString().split('T')[0];

    const cacheKey = `adsets_${campaignId || 'all'}`;
    const cachedAdSets = await getOrClearCache(cleanId, cacheKey, start, end);
    if (cachedAdSets) return cachedAdSets;

    // Fetch adsets metadata
    const adsetsResp = await this.fbClient.getAdSets(cleanId, this.accessToken, campaignId, limit);
    const adsets = adsetsResp.data || [];

    // Fetch ALL adset insights in ONE call
    const allInsights = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'adset',
      time_range: { since: start, until: end },
      time_increment: 1,
      limit: 500,
    });

    // Group by adset_id
    const insightMap = new Map<string, any[]>();
    for (const row of allInsights) {
      const aid = row.adset_id;
      if (!insightMap.has(aid)) insightMap.set(aid, []);
      insightMap.get(aid)!.push(row);
    }

    const adsetData = adsets.map((adset: any) => {
      const rows = insightMap.get(adset.id) || [];
      const m = this.aggregateDetailedData(rows);
      return {
        id: adset.id,
        name: adset.name,
        campaignId: adset.campaign_id,
        status: adset.status,
        daily_budget: adset.daily_budget,
        lifetime_budget: adset.lifetime_budget,
        ...m,
      };
    });

    setCachedInsight({ adAccountId: cleanId, insightType: cacheKey, dateRangeStart: start, dateRangeEnd: end, jsonData: JSON.stringify(adsetData) });
    return adsetData;
  }

  async getAdInsights(accountId: string, adsetId?: string, dateStart?: string, dateEnd?: string, limit: number = 500) {
    const cleanId = accountId.replace('act_', '');
    const start = dateStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = dateEnd || new Date().toISOString().split('T')[0];

    const cacheKey = `ads_${adsetId || 'all'}`;
    const cachedAds = await getOrClearCache(cleanId, cacheKey, start, end);
    if (cachedAds) return cachedAds;

    // Fetch ads metadata
    const adsResp = await this.fbClient.getAds(cleanId, this.accessToken, { adsetId }, limit);
    const ads = adsResp.data || [];

    // Fetch ALL ad insights in ONE call
    const allInsights = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'ad',
      time_range: { since: start, until: end },
      time_increment: 1,
      limit: 500,
    });

    // Group by ad_id
    const insightMap = new Map<string, any[]>();
    for (const row of allInsights) {
      const aid = row.ad_id;
      if (!insightMap.has(aid)) insightMap.set(aid, []);
      insightMap.get(aid)!.push(row);
    }

    const adData = ads.map((ad: any) => {
      const rows = insightMap.get(ad.id) || [];
      const m = this.aggregateDetailedData(rows);
      return {
        id: ad.id,
        name: ad.name,
        adsetId: ad.adset_id,
        campaignId: ad.campaign_id,
        status: ad.status,
        creative: ad.creative,
        ...m,
      };
    });

    setCachedInsight({ adAccountId: cleanId, insightType: cacheKey, dateRangeStart: start, dateRangeEnd: end, jsonData: JSON.stringify(adData) });
    return adData;
  }

  async getTrends(accountId: string, dateStart: string, dateEnd: string, breakdown: string = 'daily') {
    const cleanId = accountId.replace('act_', '');
    const cachedTrends = await getOrClearCache(cleanId, 'trends', dateStart, dateEnd, breakdown);
    if (cachedTrends) return cachedTrends;

    const increment = breakdown === 'weekly' ? 7 : breakdown === 'monthly' ? 'all_days' : 1;
    const rawData = await this.fbClient.getInsights(cleanId, this.accessToken, {
      level: 'account',
      time_range: { since: dateStart, until: dateEnd },
      time_increment: increment,
    });

    const trends: InsightDataPoint[] = (rawData || []).map((row: any) => ({
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
    }));

    setCachedInsight({
      adAccountId: cleanId,
      insightType: 'trends',
      dateRangeStart: dateStart,
      dateRangeEnd: dateEnd,
      breakdown,
      jsonData: JSON.stringify(trends),
    });

    return trends;
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

  // Detailed aggregation with per-action-type breakdown
  private aggregateDetailedData(rows: any[]) {
    let spend = 0, impressions = 0, clicks = 0, reach = 0;
    let inlineLinkClicks = 0, uniqueClicks = 0;
    let actionValues: Record<string, number> = {};
    let actions: Record<string, number> = {};
    let costPerAction: Record<string, number> = {};

    for (const row of rows) {
      spend += parseFloat(row.spend || '0');
      impressions += parseInt(row.impressions || '0');
      clicks += parseInt(row.clicks || '0');
      reach += parseInt(row.reach || '0');
      inlineLinkClicks += parseInt(row.inline_link_clicks || '0');
      uniqueClicks += parseInt(row.unique_clicks || '0');

      // Aggregate action values (for ROAS)
      for (const av of (row.action_values || [])) {
        actionValues[av.action_type] = (actionValues[av.action_type] || 0) + parseFloat(av.value || '0');
      }
      // Aggregate actions (counts)
      for (const a of (row.actions || [])) {
        actions[a.action_type] = (actions[a.action_type] || 0) + parseInt(a.value || '0');
      }
      // Cost per action type
      for (const cpa of (row.cost_per_action_type || [])) {
        costPerAction[cpa.action_type] = (costPerAction[cpa.action_type] || 0) + parseFloat(cpa.value || '0');
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
      // ROAS = purchase value / spend
      roas: spend > 0 ? Math.round((purchaseValue / spend) * 100) / 100 : 0,
      // Purchase
      purchases,
      purchaseValue: Math.round(purchaseValue * 100) / 100,
      costPerPurchase: purchases > 0 ? Math.round((spend / purchases) * 100) / 100 : 0,
      // Link clicks (unique)
      inlineLinkClicks,
      uniqueClicks,
      costPerUniqueClick: uniqueClicks > 0 ? Math.round((spend / uniqueClicks) * 100) / 100 : 0,
      // Funnel costs
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
      .filter((a: any) => conversionTypes.includes(a.action_type))
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
