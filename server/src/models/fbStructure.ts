import { query } from './database';

export interface FbCampaignRecord {
  ad_account_id: string;
  campaign_id: string;
  name: string | null;
  status: string | null;
  objective: string | null;
  daily_budget: string | null;
  lifetime_budget: string | null;
  synced_at: string;
}

export interface FbAdsetRecord {
  ad_account_id: string;
  adset_id: string;
  campaign_id: string | null;
  name: string | null;
  status: string | null;
  daily_budget: string | null;
  lifetime_budget: string | null;
  synced_at: string;
}

export interface FbAdMetaRecord {
  ad_account_id: string;
  ad_id: string;
  adset_id: string | null;
  campaign_id: string | null;
  name: string | null;
  status: string | null;
  creative: unknown | null;
  post_id: string | null;
  story_id: string | null;
  synced_at: string;
}

export async function upsertFbCampaign(input: {
  adAccountId: string;
  campaignId: string;
  name: string | null;
  status: string | null;
  objective: string | null;
  dailyBudget: string | null;
  lifetimeBudget: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO fb_campaigns
     (ad_account_id, campaign_id, name, status, objective, daily_budget, lifetime_budget, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (ad_account_id, campaign_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       status = EXCLUDED.status,
       objective = EXCLUDED.objective,
       daily_budget = EXCLUDED.daily_budget,
       lifetime_budget = EXCLUDED.lifetime_budget,
       synced_at = NOW()`,
    [
      input.adAccountId,
      input.campaignId,
      input.name,
      input.status,
      input.objective,
      input.dailyBudget,
      input.lifetimeBudget,
    ]
  );
}

export async function upsertFbAdset(input: {
  adAccountId: string;
  adsetId: string;
  campaignId: string | null;
  name: string | null;
  status: string | null;
  dailyBudget: string | null;
  lifetimeBudget: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO fb_adsets
     (ad_account_id, adset_id, campaign_id, name, status, daily_budget, lifetime_budget, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (ad_account_id, adset_id)
     DO UPDATE SET
       campaign_id = EXCLUDED.campaign_id,
       name = EXCLUDED.name,
       status = EXCLUDED.status,
       daily_budget = EXCLUDED.daily_budget,
       lifetime_budget = EXCLUDED.lifetime_budget,
       synced_at = NOW()`,
    [
      input.adAccountId,
      input.adsetId,
      input.campaignId,
      input.name,
      input.status,
      input.dailyBudget,
      input.lifetimeBudget,
    ]
  );
}

export async function upsertFbAdMeta(input: {
  adAccountId: string;
  adId: string;
  adsetId: string | null;
  campaignId: string | null;
  name: string | null;
  status: string | null;
  creative: unknown | null;
  postId: string | null;
  storyId: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO fb_ads_meta
     (ad_account_id, ad_id, adset_id, campaign_id, name, status, creative, post_id, story_id, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (ad_account_id, ad_id)
     DO UPDATE SET
       adset_id = EXCLUDED.adset_id,
       campaign_id = EXCLUDED.campaign_id,
       name = EXCLUDED.name,
       status = EXCLUDED.status,
       creative = EXCLUDED.creative,
       post_id = EXCLUDED.post_id,
       story_id = EXCLUDED.story_id,
       synced_at = NOW()`,
    [
      input.adAccountId,
      input.adId,
      input.adsetId,
      input.campaignId,
      input.name,
      input.status,
      input.creative ? JSON.stringify(input.creative) : null,
      input.postId,
      input.storyId,
    ]
  );
}

export async function updateFbCampaignStatus(
  adAccountId: string,
  campaignId: string,
  status: string | null
): Promise<void> {
  await query(
    `UPDATE fb_campaigns SET status = $3, synced_at = NOW()
     WHERE ad_account_id = $1 AND campaign_id = $2`,
    [adAccountId, campaignId, status]
  );
}

export async function updateFbAdsetStatus(
  adAccountId: string,
  adsetId: string,
  status: string | null
): Promise<void> {
  await query(
    `UPDATE fb_adsets SET status = $3, synced_at = NOW()
     WHERE ad_account_id = $1 AND adset_id = $2`,
    [adAccountId, adsetId, status]
  );
}

export async function updateFbAdMetaStatus(
  adAccountId: string,
  adId: string,
  status: string | null
): Promise<void> {
  await query(
    `UPDATE fb_ads_meta SET status = $3, synced_at = NOW()
     WHERE ad_account_id = $1 AND ad_id = $2`,
    [adAccountId, adId, status]
  );
}

export async function getFbCampaigns(adAccountId: string): Promise<FbCampaignRecord[]> {
  return query(
    `SELECT * FROM fb_campaigns WHERE ad_account_id = $1 ORDER BY name`,
    [adAccountId]
  );
}

export async function getFbAdsets(adAccountId: string): Promise<FbAdsetRecord[]> {
  return query(
    `SELECT * FROM fb_adsets WHERE ad_account_id = $1 ORDER BY name`,
    [adAccountId]
  );
}

export async function getFbAdsMeta(adAccountId: string): Promise<FbAdMetaRecord[]> {
  const rows = await query(
    `SELECT * FROM fb_ads_meta WHERE ad_account_id = $1 ORDER BY name`,
    [adAccountId]
  );
  return rows.map((r) => ({
    ...r,
    creative: r.creative ? (typeof r.creative === 'string' ? JSON.parse(r.creative) : r.creative) : null,
  }));
}
