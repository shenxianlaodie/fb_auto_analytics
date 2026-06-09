import { query } from './database';

export interface FbAdRecord {
  id: string;
  ad_account_id: string;
  ad_id: string;
  ad_name: string | null;
  post_id: string | null;
  story_id: string | null;
  spend: number;
  budget: number;
  cpm: number;
  date_start: string;
  date_end: string;
  synced_at: string;
}

export interface FbAdUpsertInput {
  adAccountId: string;
  adId: string;
  adName: string | null;
  postId: string | null;
  storyId: string | null;
  spend: number;
  budget: number;
  cpm: number;
  dateStart: string;
  dateEnd: string;
}

export async function upsertFbAd(input: FbAdUpsertInput): Promise<void> {
  await query(
    `INSERT INTO fb_ads
     (ad_account_id, ad_id, ad_name, post_id, story_id, spend, budget, cpm, date_start, date_end, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (ad_account_id, ad_id, date_start, date_end)
     DO UPDATE SET
       ad_name = EXCLUDED.ad_name,
       post_id = EXCLUDED.post_id,
       story_id = EXCLUDED.story_id,
       spend = EXCLUDED.spend,
       budget = EXCLUDED.budget,
       cpm = EXCLUDED.cpm,
       synced_at = NOW()`,
    [
      input.adAccountId,
      input.adId,
      input.adName,
      input.postId,
      input.storyId,
      input.spend,
      input.budget,
      input.cpm,
      input.dateStart,
      input.dateEnd,
    ]
  );
}

export async function getFbAdsByDateRange(
  adAccountId: string,
  dateStart: string,
  dateEnd: string
): Promise<FbAdRecord[]> {
  if (dateStart === dateEnd) {
    return query(
      `SELECT * FROM fb_ads
       WHERE ad_account_id = $1 AND date_start = $2 AND date_end = $3
       ORDER BY spend DESC`,
      [adAccountId, dateStart, dateEnd]
    );
  }

  return query(
    `SELECT
       ad_account_id,
       ad_id,
       MAX(ad_name) AS ad_name,
       MAX(post_id) AS post_id,
       MAX(story_id) AS story_id,
       SUM(spend)::numeric AS spend,
       MAX(budget)::numeric AS budget,
       CASE WHEN SUM(spend) > 0 AND SUM(CASE WHEN cpm > 0 THEN spend ELSE 0 END) > 0
         THEN (SUM(CASE WHEN cpm > 0 THEN spend * cpm ELSE 0 END) / SUM(CASE WHEN cpm > 0 THEN spend ELSE 0 END))::numeric
         ELSE 0
       END AS cpm,
       MIN(date_start) AS date_start,
       MAX(date_end) AS date_end,
       MAX(synced_at) AS synced_at
     FROM fb_ads
     WHERE ad_account_id = $1
       AND date_start >= $2 AND date_end <= $3
       AND date_start = date_end
     GROUP BY ad_account_id, ad_id
     ORDER BY spend DESC`,
    [adAccountId, dateStart, dateEnd]
  );
}

/** 删除历史多日汇总行（date_start != date_end），仅保留按天入库的数据 */
export async function deleteMultiDayFbAds(adAccountId: string): Promise<number> {
  const rows = await query(
    `DELETE FROM fb_ads
     WHERE ad_account_id = $1 AND date_start != date_end
     RETURNING id`,
    [adAccountId]
  );
  return rows.length;
}
