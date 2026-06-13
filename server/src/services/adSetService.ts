import { FacebookClient } from './facebookClient';

export class AdSetService {
  private fbClient: FacebookClient;
  private accessToken: string;

  constructor(accessToken: string) {
    this.fbClient = FacebookClient.getInstance();
    this.accessToken = accessToken;
  }

  async getAdSets(accountId: string, campaignId?: string, limit: number = 25, after?: string) {
    const result = await this.fbClient.getAdSets(
      accountId.replace('act_', ''),
      this.accessToken,
      campaignId,
      limit,
      after
    );
    return {
      data: result.data || [],
      paging: result.paging || null,
    };
  }

  async getAdSet(adsetId: string) {
    return this.fbClient.getAdSet(adsetId, this.accessToken);
  }

  async createAdSet(accountId: string, data: {
    campaignId: string;
    name: string;
    targeting: Record<string, any>;
    budget: { daily?: number; lifetime?: number };
    bidStrategy: string;
    status: string;
    startTime?: string;
    endTime?: string;
  }) {
    const params: Record<string, any> = {
      name: data.name,
      campaign_id: data.campaignId,
      targeting: data.targeting,
      bid_strategy: data.bidStrategy,
      billing_event: 'IMPRESSIONS',
      optimization_goal: data.bidStrategy.includes('COST_CAP') ? 'REACH' : 'IMPRESSIONS',
      status: data.status,
    };

    // Budget
    if (data.budget.daily) {
      params.daily_budget = Math.round(data.budget.daily); // cents
    }
    if (data.budget.lifetime) {
      params.lifetime_budget = Math.round(data.budget.lifetime);
    }

    // Schedule
    if (data.startTime) params.start_time = data.startTime;
    if (data.endTime) params.end_time = data.endTime;

    return this.fbClient.createAdSet(
      accountId.replace('act_', ''),
      this.accessToken,
      params
    );
  }

  async updateAdSet(
    adsetId: string,
    data: { name?: string; status?: string; budget?: { daily?: number; lifetime?: number } }
  ) {
    const params: Record<string, any> = {};
    if (data.name) params.name = data.name;
    if (data.status) params.status = data.status;
    if (data.budget?.lifetime) {
      params.lifetime_budget = Math.round(data.budget.lifetime);
    } else if (data.budget?.daily) {
      params.daily_budget = Math.round(data.budget.daily);
    }
    return this.fbClient.updateAdSet(adsetId, this.accessToken, params);
  }

  async deleteAdSet(adsetId: string) {
    return this.fbClient.deleteAdSet(adsetId, this.accessToken);
  }
}
