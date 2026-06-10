import { FacebookClient } from './facebookClient';

export class CampaignService {
  private fbClient: FacebookClient;
  private accessToken: string;

  constructor(accessToken: string) {
    this.fbClient = FacebookClient.getInstance();
    this.accessToken = accessToken;
  }

  async getCampaigns(accountId: string, limit: number = 25, after?: string) {
    const result = await this.fbClient.getCampaigns(
      accountId.replace('act_', ''),
      this.accessToken,
      limit,
      after
    );
    return {
      data: result.data || [],
      paging: result.paging || null,
    };
  }

  async getCampaign(campaignId: string) {
    return this.fbClient.getCampaign(campaignId, this.accessToken);
  }

  async createCampaign(accountId: string, data: {
    name: string;
    objective: string;
    status?: string;
    specialAdCategories?: string[];
  }) {
    const params: Record<string, any> = {
      name: data.name,
      objective: data.objective,
      status: data.status || 'PAUSED',
      special_ad_categories: data.specialAdCategories || [],
    };
    return this.fbClient.createCampaign(
      accountId.replace('act_', ''),
      this.accessToken,
      params
    );
  }

  async updateCampaign(campaignId: string, data: { name?: string; status?: string; budget?: { daily?: number } }) {
    const params: Record<string, any> = {};
    if (data.name) params.name = data.name;
    if (data.status) params.status = data.status;
    if (data.budget?.daily) params.daily_budget = Math.round(data.budget.daily);
    return this.fbClient.updateCampaign(campaignId, this.accessToken, params);
  }

  async deleteCampaign(campaignId: string) {
    return this.fbClient.deleteCampaign(campaignId, this.accessToken);
  }
}
