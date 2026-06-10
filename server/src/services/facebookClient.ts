import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
const { HttpsProxyAgent } = require('https-proxy-agent');
import { config } from '../config';
import { getFbQueue } from './fbRequestQueue';
import { sleep } from '../utils/sleep';
import { recordUsageHeaders } from './fbUsageMonitor';

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
    return getFbQueue().enqueue(async () => {
      try {
        const response = await this.axios.get(`${this.baseUrl}/${edge}`, {
          params: { ...params, access_token: accessToken },
        });
        recordUsageHeaders(edge, response.headers);
        return response.data;
      } catch (err: any) {
        recordUsageHeaders(edge, err.response?.headers);
        console.error('[FB API Error] edge:', edge, 'status:', err.response?.status, 'body:', JSON.stringify(err.response?.data?.error));
        throw err;
      }
    });
  }

  private async post(edge: string, accessToken: string, data: Record<string, any> = {}): Promise<any> {
    return getFbQueue().enqueue(async () => {
      try {
        const response = await this.axios.post(`${this.baseUrl}/${edge}`, data, {
          params: { access_token: accessToken },
        });
        recordUsageHeaders(edge, response.headers);
        return response.data;
      } catch (err: any) {
        recordUsageHeaders(edge, err.response?.headers);
        throw err;
      }
    });
  }

  private async postFormData(edge: string, accessToken: string, formData: Record<string, any>): Promise<any> {
    return getFbQueue().enqueue(async () => {
      const response = await this.axios.post(`${this.baseUrl}/${edge}`, formData, {
        params: { access_token: accessToken },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    });
  }

  // --- Ad Accounts ---

  async getAdAccounts(accessToken: string): Promise<any[]> {
    const all: any[] = [];
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const params: Record<string, any> = {
        fields: 'id,name,account_id,currency,timezone_name,account_status',
        limit: 100,
      };
      if (after) params.after = after;
      const resp = await this.get('me/adaccounts', accessToken, params);
      all.push(...(resp.data || []));
      after = resp.paging?.cursors?.after;
      if (!after) break;
    }
    return all;
  }

  // --- Campaigns ---

  private async fetchAllPages(
    edge: string,
    accessToken: string,
    fields: string,
    pageSize = 100,
    maxPages = 20,
    pageGapMs = 0,
    extraParams?: Record<string, any>
  ): Promise<any[]> {
    const all: any[] = [];
    let after: string | undefined;
    let limit = pageSize;
    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, any> = { ...extraParams, fields, limit };
      if (after) params.after = after;
      let resp: any;
      try {
        resp = await this.get(edge, accessToken, params);
      } catch (err: any) {
        // 数据量过大错误 → 减半页大小重试当前页
        if (limit > 50) {
          limit = Math.max(50, Math.floor(limit / 2));
          console.warn(`[FB Client] ${edge} page failed, retry with limit=${limit}`);
          resp = await this.get(edge, accessToken, { ...extraParams, fields, limit, ...(after ? { after } : {}) });
        } else {
          throw err;
        }
      }
      all.push(...(resp.data || []));
      after = resp.paging?.cursors?.after;
      if (!after) break;
      if (pageGapMs > 0) await sleep(pageGapMs);
    }
    return all;
  }

  async getAllCampaigns(
    accountId: string,
    accessToken: string,
    pageSize: number = 100,
    maxPages: number = 50,
    pageGapMs = 0,
    extraParams?: Record<string, any>
  ): Promise<any[]> {
    const fields =
      'id,name,objective,status,special_ad_categories,created_time,updated_time,daily_budget,lifetime_budget';
    return this.fetchAllPages(`act_${accountId}/campaigns`, accessToken, fields, pageSize, maxPages, pageGapMs, extraParams);
  }

  async getAllAdSets(
    accountId: string,
    accessToken: string,
    pageSize: number = 100,
    maxPages: number = 50,
    pageGapMs = 0,
    extraParams?: Record<string, any>
  ): Promise<any[]> {
    const fields =
      'id,name,campaign_id,status,targeting,bid_strategy,daily_budget,lifetime_budget,billing_event,optimization_goal,start_time,end_time,created_time';
    return this.fetchAllPages(`act_${accountId}/adsets`, accessToken, fields, pageSize, maxPages, pageGapMs, extraParams);
  }

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

  async getAds(accountId: string, accessToken: string, filters: { adsetId?: string; campaignId?: string }, limit: number = 25, after?: string, extraParams?: Record<string, any>): Promise<any> {
    const params: Record<string, any> = {
      ...extraParams,
      fields: 'id,name,adset_id,campaign_id,status,creative{id,effective_object_story_id,object_story_id},created_time',
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
      fields: 'id,name,adset_id,campaign_id,status,creative{id,effective_object_story_id,object_story_id},created_time,tracking_specs',
    });
  }

  async getAllAds(
    accountId: string,
    accessToken: string,
    filters: { adsetId?: string; campaignId?: string } = {},
    pageSize: number = 100,
    maxPages: number = 20,
    pageGapMs = 0,
    extraParams?: Record<string, any>
  ): Promise<any[]> {
    const all: any[] = [];
    let after: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const resp = await this.getAds(accountId, accessToken, filters, pageSize, after, extraParams);
      all.push(...(resp.data || []));
      after = resp.paging?.cursors?.after;
      if (!after) break;
      if (pageGapMs > 0) await sleep(pageGapMs);
    }
    return all;
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

  private static INSIGHT_FIELDS: Record<string, string> = {
    account: 'spend,impressions,clicks,reach,cpm,cpc,ctr,cost_per_action_type,actions,action_values,inline_link_clicks,unique_clicks,cost_per_unique_click,date_start,date_stop',
    campaign: 'campaign_id,campaign_name,spend,impressions,clicks,reach,cpm,cpc,ctr,cost_per_action_type,actions,action_values,inline_link_clicks,unique_clicks,cost_per_unique_click,date_start,date_stop',
    adset: 'adset_id,adset_name,campaign_id,spend,impressions,clicks,reach,cpm,cpc,ctr,cost_per_action_type,actions,action_values,inline_link_clicks,unique_clicks,cost_per_unique_click,date_start,date_stop',
    ad: 'ad_id,ad_name,spend,cpm,date_start,date_stop',
  };

  async getInsights(accountId: string, accessToken: string, params: Record<string, any>): Promise<any[]> {
    const level = params.level || 'account';
    const { time_range, fields, level: _lvl, ...rest } = params;

    const queryParams: Record<string, any> = {
      fields: fields || FacebookClient.INSIGHT_FIELDS[level] || FacebookClient.INSIGHT_FIELDS.account,
      level,
      time_increment: rest.time_increment ?? 1,
      limit: rest.limit ?? 500,
      ...rest,
    };

    if (time_range) {
      queryParams.time_range = typeof time_range === 'string'
        ? time_range
        : JSON.stringify(time_range);
    }

    // 分页拉取全部 insights，避免广告数 > limit 时数据不全（导致用户反复刷新）
    const all: any[] = [];
    let after: string | undefined;
    const maxPages = 20;
    for (let page = 0; page < maxPages; page++) {
      const params = after ? { ...queryParams, after } : queryParams;
      const resp = await this.get(`act_${accountId}/insights`, accessToken, params);
      all.push(...(resp.data || []));
      after = resp.paging?.cursors?.after;
      if (!after || !resp.paging?.next) break;
    }
    return all;
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

    const response = await getFbQueue().enqueue(() =>
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

    const response = await getFbQueue().enqueue(() =>
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
