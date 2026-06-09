import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { initDatabase, query } from '../src/models/database';
import { todayDateRange } from '../src/utils/todayRange';

async function main() {
  await initDatabase();
  const accountId = process.argv[2] || '1477243063804898';
  const { dateStart, dateEnd } = todayDateRange();

  const states = await query(
    `SELECT sync_type, date_start, date_end, last_synced_at, refreshing, shop_id
     FROM sync_state
     WHERE ad_account_id = $1
     ORDER BY last_synced_at DESC NULLS LAST
     LIMIT 15`,
    [accountId]
  );

  const refreshing = await query(
    `SELECT COUNT(*)::int AS cnt FROM sync_state WHERE refreshing = true`
  );

  console.log('account', accountId, 'today', dateStart);
  console.log('global refreshing rows:', refreshing[0].cnt);
  console.log('recent sync_state:', states);

  const metricsToday = states.find(
    (s) => s.sync_type === 'metrics' && s.date_start === dateStart && s.date_end === dateEnd
  );
  console.log('metrics today:', metricsToday || 'NOT FOUND');
  process.exit(0);
}

main();
