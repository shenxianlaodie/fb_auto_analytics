import { initDatabase, query, queryOne } from '../src/models/database';
import { todayDateRange } from '../src/utils/todayRange';

const AD_ID = process.argv[2] || '52515317071088';

async function main() {
  await initDatabase();
  const { dateStart, dateEnd } = todayDateRange();
  console.log('date', dateStart, dateEnd);
  console.log('ad_id', AD_ID);

  const meta = await queryOne(
    `SELECT * FROM fb_ads_meta WHERE ad_id = $1`,
    [AD_ID]
  );
  console.log('\n=== fb_ads_meta ===');
  console.log(meta || 'NOT FOUND');

  const metrics = await query(
    `SELECT * FROM fb_ads WHERE ad_id = $1 AND date_start = $2 AND date_end = $3`,
    [AD_ID, dateStart, dateEnd]
  );
  console.log('\n=== fb_ads (today) ===');
  console.log(metrics.length ? metrics : 'NO ROWS');

  const utmAll = await query(
    `SELECT shop_id, utm_value, uv, orders, sales, date_start, date_end, synced_at
     FROM shoplazza_utm
     WHERE utm_value = $1 AND dimension = 'utm_content'
     ORDER BY date_start DESC, shop_id
     LIMIT 20`,
    [AD_ID]
  );
  console.log('\n=== shoplazza_utm (any date, exact ad_id) ===');
  console.log(utmAll.length ? utmAll : 'NO ROWS');

  const utmToday = await query(
    `SELECT shop_id, utm_value, uv, orders, sales, synced_at
     FROM shoplazza_utm
     WHERE utm_value = $1 AND dimension = 'utm_content'
       AND date_start = $2 AND date_end = $3`,
    [AD_ID, dateStart, dateEnd]
  );
  console.log('\n=== shoplazza_utm (today exact) ===');
  console.log(utmToday.length ? utmToday : 'NO ROWS');

  const utmLike = await query(
    `SELECT shop_id, utm_value, uv, orders, sales, date_start
     FROM shoplazza_utm
     WHERE utm_value LIKE $1 AND dimension = 'utm_content'
     ORDER BY date_start DESC LIMIT 10`,
    [`%${AD_ID}%`]
  );
  console.log('\n=== shoplazza_utm (LIKE partial) ===');
  console.log(utmLike.length ? utmLike : 'NO ROWS');

  if (meta?.ad_account_id) {
    const mapping = await query(
      `SELECT * FROM account_shop_mapping WHERE account_id IN ($1, $2)`,
      [meta.ad_account_id, `act_${meta.ad_account_id}`]
    );
    console.log('\n=== account_shop_mapping ===');
    console.log(mapping.length ? mapping : 'NO MAPPING');

    const joinRows = await query(
      `SELECT u.shop_id, u.utm_value, u.uv, u.orders, u.sales
       FROM shoplazza_utm u
       INNER JOIN fb_ads_meta m ON m.ad_id = u.utm_value AND m.ad_account_id = $1
       WHERE u.date_start = $2 AND u.date_end = $3 AND u.dimension = 'utm_content'
         AND m.ad_id = $4`,
      [meta.ad_account_id, dateStart, dateEnd, AD_ID]
    );
    console.log('\n=== hierarchy JOIN result ===');
    console.log(joinRows.length ? joinRows : 'NO JOIN MATCH');
  }

  const { HierarchyService } = await import('../src/services/hierarchyService');
  const hierarchy = await new HierarchyService().getHierarchyFromDb(
    `act_${meta?.ad_account_id || '1221981739454062'}`,
    dateStart,
    dateEnd
  );
  const adRow = hierarchy.ads.find((a: { id: string }) => a.id === AD_ID);
  console.log('\n=== hierarchy ad row ===');
  console.log(adRow || 'NOT IN HIERARCHY');
  console.log('meta.matched', hierarchy.meta.matched);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
