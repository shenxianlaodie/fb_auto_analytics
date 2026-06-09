import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { initDatabase, query } from '../src/models/database';
import { todayDateRange } from '../src/utils/todayRange';
import { HierarchyService } from '../src/services/hierarchyService';

async function main() {
  await initDatabase();
  const { dateStart, dateEnd } = todayDateRange();
  const accountId = process.argv[2] || '1337449094814463';

  const spendSum = await query(
    `SELECT COALESCE(SUM(spend),0) as total, COUNT(*)::int as rows
     FROM fb_ads WHERE ad_account_id = $1 AND date_start = $2 AND date_end = $3`,
    [accountId, dateStart, dateEnd]
  );
  const topAds = await query(
    `SELECT ad_id, ad_name, spend, cpm FROM fb_ads
     WHERE ad_account_id = $1 AND date_start = $2 AND date_end = $3
     ORDER BY spend DESC LIMIT 10`,
    [accountId, dateStart, dateEnd]
  );
  const metaCount = await query(
    `SELECT COUNT(*)::int as cnt FROM fb_ads_meta WHERE ad_account_id = $1`,
    [accountId]
  );
  const sync = await query(
    `SELECT sync_type, last_synced_at, refreshing FROM sync_state
     WHERE ad_account_id = $1 AND date_start = $2`,
    [accountId, dateStart]
  );
  const joinCheck = await query(
    `SELECT COUNT(*)::int as matched,
            COALESCE(SUM(f.spend),0) as matched_spend
     FROM fb_ads_meta m
     INNER JOIN fb_ads f ON f.ad_id = m.ad_id AND f.ad_account_id = m.ad_account_id
       AND f.date_start = $2 AND f.date_end = $3
     WHERE m.ad_account_id = $1`,
    [accountId, dateStart, dateEnd]
  );

  console.log('account:', accountId);
  console.log('date:', dateStart);
  console.log('fb_ads:', spendSum[0]);
  console.log('top ads:', topAds);
  console.log('meta count:', metaCount[0]);
  console.log('meta+metrics join:', joinCheck[0]);
  const campaignRollup = await query(
    `SELECT m.campaign_id, c.name, COUNT(*)::int AS ads, COALESCE(SUM(f.spend), 0) AS spend
     FROM fb_ads_meta m
     INNER JOIN fb_ads f
       ON f.ad_id = m.ad_id AND f.ad_account_id = m.ad_account_id
       AND f.date_start = $2 AND f.date_end = $3
     LEFT JOIN fb_campaigns c
       ON c.campaign_id = m.campaign_id AND c.ad_account_id = m.ad_account_id
     WHERE m.ad_account_id = $1
     GROUP BY m.campaign_id, c.name
     ORDER BY spend DESC
     LIMIT 15`,
    [accountId, dateStart, dateEnd]
  );

  console.log('campaign rollup:', campaignRollup);

  const hierarchy = await new HierarchyService().getHierarchyFromDb(accountId, dateStart, dateEnd);
  const withSpend = hierarchy.campaigns.filter((c) => Number(c.spend) > 0);
  console.log('hierarchy campaigns with spend:', withSpend.length, '/', hierarchy.campaigns.length);
  console.log('top hierarchy campaigns:', withSpend.slice(0, 5).map((c) => ({ id: c.id, name: c.name, spend: c.spend })));

  console.log('sync_state:', sync);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
