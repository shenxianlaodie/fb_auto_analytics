import { FacebookClient } from './facebookClient';

export class AdService {
  private fbClient: FacebookClient;
  private accessToken: string;

  constructor(accessToken: string) {
    this.fbClient = FacebookClient.getInstance();
    this.accessToken = accessToken;
  }

  async getAds(
    accountId: string,
    filters: { adsetId?: string; campaignId?: string },
    limit: number = 25,
    after?: string
  ) {
    const result = await this.fbClient.getAds(
      accountId.replace('act_', ''),
      this.accessToken,
      filters,
      limit,
      after
    );
    return {
      data: result.data || [],
      paging: result.paging || null,
    };
  }

  async getAd(adId: string) {
    return this.fbClient.getAd(adId, this.accessToken);
  }

  async createAd(accountId: string, data: {
    adsetId: string;
    name: string;
    creative: {
      title: string;
      body: string;
      imageHash?: string;
      imageUrl?: string;
      linkUrl: string;
      callToAction: string;
      videoId?: string;
      pageId?: string;
    };
    status: string;
    trackingSpecs?: any[];
  }) {
    // Step 1: Create ad creative first
    const creativeParams: Record<string, any> = {
      title: data.creative.title,
      body: data.creative.body,
      object_story_spec: {
        page_id: data.creative.pageId, // Will need page_id from user
        link_data: {
          link: data.creative.linkUrl,
          message: data.creative.body,
          name: data.creative.title,
          call_to_action: {
            type: data.creative.callToAction,
          },
        },
      },
    };

    if (data.creative.imageHash) {
      creativeParams.object_story_spec.link_data.picture = data.creative.imageHash;
    } else if (data.creative.imageUrl) {
      creativeParams.object_story_spec.link_data.picture = data.creative.imageUrl;
    }

    const creative = await this.fbClient.createAdCreative(
      accountId.replace('act_', ''),
      this.accessToken,
      creativeParams
    );

    // Step 2: Create ad
    const adParams: Record<string, any> = {
      name: data.name,
      adset_id: data.adsetId,
      creative: { creative_id: creative.id },
      status: data.status,
    };

    if (data.trackingSpecs) {
      adParams.tracking_specs = data.trackingSpecs;
    }

    return this.fbClient.createAd(
      accountId.replace('act_', ''),
      this.accessToken,
      adParams
    );
  }

  async updateAd(adId: string, data: { name?: string; status?: string }) {
    const params: Record<string, any> = {};
    if (data.name) params.name = data.name;
    if (data.status) params.status = data.status;
    return this.fbClient.updateAd(adId, this.accessToken, params);
  }

  async deleteAd(adId: string) {
    return this.fbClient.deleteAd(adId, this.accessToken);
  }
}
