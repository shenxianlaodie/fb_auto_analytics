import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { initDatabase, query } from '../src/models/database';
import { todayDateRange } from '../src/utils/todayRange';

async function main() {
  await initDatabase();
  const { dateStart, dateEnd } = todayDateRange();
  const accountId = '1337449094814463';
  const campaignId = process.argv[2] || '6895163812197';

  const camp = await query(
    `SELECT * FROM fb_campaigns WHERE ad_account_id=$1 AND campaign_id=$2`,
    [accountId, campaignId]
  );
  const childAds = await query(
    `SELECT m.ad_id, m.name, m.status, COALESCE(f.spend,0) spend
     FROM fb_ads_meta m
     LEFT JOIN fb_ads f ON f.ad_id=m.ad_id AND f.ad_account_id=m.ad_account_id
       AND f.date_start=$3 AND f.date_end=$4
     WHERE m.ad_account_id=$1 AND m.campaign_id=$2
     ORDER BY spend DESC LIMIT 10`,
    [accountId, campaignId, dateStart, dateEnd]
  );
  console.log('campaign:', camp[0]);
  console.log('child ads:', childAds);
  process.exit(0);
}
main();
