import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { initDatabase, query } from '../src/models/database';

async function main() {
  await initDatabase();
  const accountId = process.argv[2] || '1337449094814463';
  const campaignId = process.argv[3] || '6951424292797';

  const [c, a, m] = await Promise.all([
    query('SELECT COUNT(*)::int AS cnt FROM fb_campaigns WHERE ad_account_id = $1', [accountId]),
    query('SELECT COUNT(*)::int AS cnt FROM fb_adsets WHERE ad_account_id = $1', [accountId]),
    query('SELECT COUNT(*)::int AS cnt FROM fb_ads_meta WHERE ad_account_id = $1', [accountId]),
  ]);

  const adsetsForCamp = await query(
    `SELECT adset_id, campaign_id, name FROM fb_adsets
     WHERE ad_account_id = $1 AND campaign_id = $2 LIMIT 10`,
    [accountId, campaignId]
  );

  const adsForCamp = await query(
    `SELECT ad_id, adset_id, campaign_id, name FROM fb_ads_meta
     WHERE ad_account_id = $1 AND campaign_id = $2 LIMIT 10`,
    [accountId, campaignId]
  );

  const orphanAds = await query(
    `SELECT COUNT(*)::int AS cnt FROM fb_ads_meta m
     WHERE m.ad_account_id = $1
       AND m.adset_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM fb_adsets s
         WHERE s.ad_account_id = m.ad_account_id AND s.adset_id = m.adset_id
       )`,
    [accountId]
  );

  console.log({ accountId, campaigns: c[0].cnt, adsets: a[0].cnt, adsMeta: m[0].cnt, orphanAds: orphanAds[0].cnt });
  console.log('adsetsForCampaign', adsetsForCamp);
  console.log('adsForCampaign', adsForCamp);
  process.exit(0);
}

main();
