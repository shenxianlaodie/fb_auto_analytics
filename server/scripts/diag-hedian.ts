import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { initDatabase, query } from '../src/models/database';

async function main() {
  await initDatabase();
  const q = process.argv[2] || 'hedian';

  const campaigns = await query(
    `SELECT ad_account_id, campaign_id, name FROM fb_campaigns
     WHERE name ILIKE $1 ORDER BY name LIMIT 20`,
    [`%${q}%`]
  );

  for (const c of campaigns) {
    const adsetCnt = await query(
      `SELECT COUNT(*)::int AS cnt FROM fb_adsets WHERE ad_account_id = $1 AND campaign_id = $2`,
      [c.ad_account_id, c.campaign_id]
    );
    const adCnt = await query(
      `SELECT COUNT(*)::int AS cnt FROM fb_ads_meta WHERE ad_account_id = $1 AND campaign_id = $2`,
      [c.ad_account_id, c.campaign_id]
    );
    console.log({
      account: c.ad_account_id,
      campaign_id: c.campaign_id,
      name: c.name,
      adsets: adsetCnt[0].cnt,
      ads: adCnt[0].cnt,
    });
  }
  process.exit(0);
}

main();
