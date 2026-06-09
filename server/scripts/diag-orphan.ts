import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { initDatabase, query } from '../src/models/database';

async function main() {
  await initDatabase();
  const accountId = process.argv[2] || '1477243063804898';
  const adsetId = process.argv[3] || '120244012023220600';

  const row = await query(
    `SELECT * FROM fb_adsets WHERE ad_account_id = $1 AND adset_id = $2`,
    [accountId, adsetId]
  );
  console.log('adset row', row[0] || 'NOT FOUND');

  const sample = await query(
    `SELECT m.ad_id, m.adset_id, m.campaign_id, s.adset_id AS in_adsets
     FROM fb_ads_meta m
     LEFT JOIN fb_adsets s ON s.ad_account_id = m.ad_account_id AND s.adset_id = m.adset_id
     WHERE m.ad_account_id = $1 AND s.adset_id IS NULL AND m.adset_id IS NOT NULL
     LIMIT 5`,
    [accountId]
  );
  console.log('orphan sample', sample);
  process.exit(0);
}

main();
