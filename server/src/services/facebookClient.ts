import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
const { HttpsProxyAgent } = require('https-proxy-agent');
import { config } from '../config';
import { fbQueue } from './fbRequestQueue';

interface TokenExchangeResult {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: string;
}

interface LongLivedTokenResult {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface FBUserProfile {
  id: string;
  name: string;
  email?: string;
}

function createAxios(): AxiosInstance {
  const opts: Record<string, any> = {};
  if (config.facebook.proxy) {
    opts.httpsAgent = new HttpsProxyAgent(config.facebook.proxy);
  }
  return axios.create(opts);
}

export class FacebookClient {
  private static instance: FacebookClient;
  private baseUrl: string;
  private axios: AxiosInstance;

  private constructor() {
    this.baseUrl = `https://graph.facebook.com/${config.facebook.apiVersion}`;
    this.axios = createAxios();
  }

  static getInstance(): FacebookClient {
    if (!FacebookClient.instance) {
      FacebookClient.instance = new FacebookClient();
    }
    return FacebookClient.instance;
  }

  // --- Auth ---

  async exchangeCodeForToken(code: string): Promise<TokenExchangeResult> {
    const url = `https://graph.facebook.com/${config.facebook.apiVersion}/oauth/access_token`;
    const response = await this.axios.get(url, {
      params: {
        client_id: config.facebook.appId,
        client_secret: config.facebook.appSecret,
        redirect_uri: config.facebook.redirectUri,
        code,
      },
    });

    // Exchange short-lived token for long-lived token
    const longLived = await this.refreshLongLivedToken(response.data.access_token);

    return {
      access_token: longLived.access_token,
      token_type: 'bearer',
      expires_in: longLived.expires_in,
      expires_at: new Date(Date.now() + longLived.expires_in * 1000).toISOString(),
    };
  }

  async refreshLongLivedToken(shortLivedToken: string): Promise<LongLivedTokenResult> {
    const url = `https://graph.facebook.com/${config.facebook.apiVersion}/oauth/access_token`;
    const response = await this.axios.get(url, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: config.facebook.appId,
        client_secret: config.facebook.appSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
    return response.data;
  }

  async getUserProfile(accessToken: string): Promise<FBUserProfile> {
    const response = await this.axios.get(`${this.baseUrl}/me`, {
      params: {
        fields: 'id,name,email',
        access_token: accessToken,
      },
    });
    return response.data;
  }

  // --- Graph API Helpers ---

  private async get(edge: string, accessToken: string, params: Record<string, any> = {}): Promise<any> {
    return fbQueue.enqueue(async () => {
      try {
        const response = await this.axios.get(`${this.baseUrl}/${edge}`, {
          params: { ...params, access_token: accessToken },
        });
        return response.data;
      } catch (err: any) {
        console.error('[FB API Error] edge:', edge, 'status:', err.response?.status, 'body:', JSON.stringify(err.response?.data?.error));
        throw err;
      }
    });
  }

  private async post(edge: string, accessToken: string, data: Record<string, any> = {}): Promise<any> {
    return fbQueue.enqueue(async () => {
      const response = await this.axios.post(`${this.baseUrl}/${edge}`, data, {
        params: { access_token: accessToken },
      });
      return response.data;
    });
  }

  private async postFormData(edge: string, accessToken: string, formData: Record<string, any>): Promise<any> {
    return fbQueue.enqueue(async () => {
      const response = await this.axios.post(`${this.baseUrl}/${edge}`, formData, {
        params: { access_token: accessToken },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    });
  }

  // --- Ad Accounts ---

  async getAdAccounts(accessToken: string): Promise<any[]> {
    const resp = await this.get('me/adaccounts', accessToken, {
      fields: 'id,name,account_id,currency,timezone_name,account_status',
      limit: 100,
    });
    console.log('[FB] getAdAccounts raw response:', JSON.stringify(resp));
    return resp.data || [];
  }

  // --- Campaigns ---

  async getCampaigns(accountId: string, accessToken: string, limit: number = 25, after?: string): Promise<any> {
    const params: Record<string, any> = {
      fields: 'id,name,objective,status,special_ad_categories,created_time,updated_time,daily_budget,lifetime_budget',
      limit,
    };
    if (after) params.after = after;
    return this.get(`act_${accountId}/campaigns`, accessToken, params);
  }

  async getCampaign(campaignId: string, accessToken: string): Promise<any> {
    return this.get(campaignId, accessToken, {
      fields: 'id,name,objective,status,special_ad_categories,created_time,updated_time,daily_budget,lifetime_budget',
    });
  }

  async createCampaign(accountId: string, accessToken: string, data: Record<string, any>): Promise<any> {
    return this.post(`act_${accountId}/campaigns`, accessToken, data);
  }

  async updateCampaign(campaignId: string, accessToken: string, data: Record<string, any>): Promise<any> {
    return this.post(campaignId, accessToken, data);
  }

  async deleteCampaign(campaignId: string, accessToken: string): Promise<any> {
    return this.post(campaignId, accessToken, { status: 'DELETED' });
  }

  // --- Ad Sets ---

  async getAdSets(accountId: string, accessToken: string, campaignId?: string, limit: number = 25, after?: string): Promise<any> {
    const params: Record<string, any> = {
      fields: 'id,name,campaign_id,status,targeting,bid_strategy,daily_budget,lifetime_budget,billing_event,optimization_goal,start_time,end_time,created_time',
      limit,
    };
    if (after) params.after = after;

    const edge = campaignId
      ? `${campaignId}/adsets`
      : `act_${accountId}/adsets`;
    return this.get(edge, accessToken, params);
  }

  async getAdSet(adsetId: string, accessToken: string): Promise<any> {
    return this.get(adsetId, accessToken, {
      fields: 'id,name,campaign_id,status,targeting,bid_strategy,daily_budget,lifetime_budget,billing_event,optimization_goal,start_time,end_time',
    });
  }

  async createAdSet(accountId: string, accessToken: string, data: Record<string, any>): Promise<any> {
    return this.post(`act_${accountId}/adsets`, accessToken, data);
  }

  async updateAdSet(adsetId: string, accessToken: string, data: Record<string, any>): Promise<any> {
    return this.post(adsetId, accessToken, data);
  }

  async deleteAdSet(adsetId: string, accessToken: string): Promise<any> {
    return this.post(adsetId, accessToken, { status: 'DELETED' });
  }

  // --- Ads ---

  async getAds(accountId: string, accessToken: string, filters: { adsetId?: string; campaignId?: string }, limit: number = 25, after?: string): Promise<any> {
    const params: Record<string, any> = {
      fields: 'id,name,adset_id,campaign_id,status,creative{id,title,body,image_url,thumbnail_url},created_time',
      limit,
    };
    if (after) params.after = after;

    let edge = `act_${accountId}/ads`;
    if (filters.adsetId) edge = `${filters.adsetId}/ads`;
    else if (filters.campaignId) edge = `${filters.campaignId}/ads`;

    return this.get(edge, accessToken, params);
  }

  async getAd(adId: string, accessToken: string): Promise<any> {
    return this.get(adId, accessToken, {
      fields: 'id,name,adset_id,campaign_id,status,creative,created_time,tracking_specs',
    });
  }

  async createAd(accountId: string, accessToken: string, data: Record<string, any>): Promise<any> {
    return this.post(`act_${accountId}/ads`, accessToken, data);
  }

  async updateAd(adId: string, accessToken: string, data: Record<string, any>): Promise<any> {
    return this.post(adId, accessToken, data);
  }

  async deleteAd(adId: string, accessToken: string): Promise<any> {
    return this.post(adId, accessToken, { status: 'DELETED' });
  }

  // --- Insights ---

  async getInsights(accountId: string, accessToken: string, params: Record<string, any>): Promise<any[]> {
    const defaultParams: Record<string, any> = {
      fields: 'spend,impressions,clicks,reach,cpm,cpc,ctr,cost_per_action_type,actions,action_values,website_ctr,inline_link_clicks,cost_per_inline_link_click,unique_clicks,cost_per_unique_click,cost_per_unique_action_type,date_start,date_stop,campaign_name',
      level: 'account',
      time_increment: 1,
      limit: 500,
    };

    const resp = await this.get(`act_${accountId}/insights`, accessToken, {
      ...defaultParams,
      ...params,
    });

    return resp.data || [];
  }

  // --- Ad Creatives ---

  async createAdCreative(accountId: string, accessToken: string, data: Record<string, any>): Promise<any> {
    return this.post(`act_${accountId}/adcreatives`, accessToken, data);
  }

  async uploadAdImage(accountId: string, filePath: string, accessToken: string): Promise<string> {
    const FormData = (await import('form-data')).default;
    const fileStream = fs.createReadStream(filePath);

    // Facebook requires the image to be uploaded as multipart/form-data
    const url = `${this.baseUrl}/act_${accountId}/adimages`;
    const form = new FormData();
    form.append('access_token', accessToken);
    form.append('file', fileStream);

    const response = await fbQueue.enqueue(() =>
      this.axios.post(url, form, { headers: form.getHeaders() })
    );

    // Return the image hash from the response
    const images = response.data?.images;
    if (images) {
      const firstKey = Object.keys(images)[0];
      return images[firstKey]?.hash || firstKey;
    }
    throw new Error('图片上传失败：未返回 hash');
  }

  async uploadAdVideo(accountId: string, filePath: string, accessToken: string): Promise<string> {
    const FormData = (await import('form-data')).default;
    const fileStream = fs.createReadStream(filePath);

    const url = `${this.baseUrl}/act_${accountId}/advideos`;
    const form = new FormData();
    form.append('access_token', accessToken);
    form.append('file', fileStream);

    const response = await fbQueue.enqueue(() =>
      this.axios.post(url, form, { headers: form.getHeaders() })
    );

    return response.data?.id || '';
  }

  // --- Targeting Search ---

  async searchTargeting(accessToken: string, query: string, type: string = 'adinterest'): Promise<any[]> {
    const resp = await this.get('search', accessToken, {
      type,
      q: query,
      limit: 50,
    });
    return resp.data || [];
  }
}
