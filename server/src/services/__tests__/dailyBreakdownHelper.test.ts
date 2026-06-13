import { describe, expect, it } from 'vitest';
import {
  buildAdDailyMetricsMap,
  buildEntityDailyBreakdown,
  buildEntityDailySpendMap,
  dailyBreakdownForAd,
  mergeEntityDailyBreakdown,
  rollupDailyBreakdown,
} from '../dailyBreakdownHelper';

describe('dailyBreakdownHelper', () => {
  it('rollupDailyBreakdown 按日期倒序并汇总子广告', () => {
    const map = buildAdDailyMetricsMap(
      [
        {
          id: '1',
          ad_account_id: 'acc',
          ad_id: 'ad1',
          ad_name: 'A',
          post_id: null,
          story_id: null,
          spend: 10,
          budget: 50,
          cpm: 2,
          date_start: '2026-06-12',
          date_end: '2026-06-12',
          synced_at: '',
        },
        {
          id: '2',
          ad_account_id: 'acc',
          ad_id: 'ad2',
          ad_name: 'B',
          post_id: null,
          story_id: null,
          spend: 5,
          budget: 50,
          cpm: 4,
          date_start: '2026-06-12',
          date_end: '2026-06-12',
          synced_at: '',
        },
      ],
      [],
    );

    const rows = rollupDailyBreakdown(['ad1', 'ad2'], map, '2026-06-11', '2026-06-12');
    expect(rows.map((r) => r.date)).toEqual(['2026-06-12', '2026-06-11']);
    expect(rows[0].spend).toBe(15);
    expect(rows[0].cpm).toBeCloseTo(2.667, 2);
    expect(rows[1].spend).toBe(0);
  });

  it('buildEntityDailyBreakdown 使用 SQL spend 与 UTM rollup 合并', () => {
    const adDailyMap = buildAdDailyMetricsMap(
      [
        {
          id: '1',
          ad_account_id: 'acc',
          ad_id: 'ad1',
          ad_name: 'A',
          post_id: null,
          story_id: null,
          spend: 20,
          budget: 0,
          cpm: 2,
          date_start: '2026-06-13',
          date_end: '2026-06-13',
          synced_at: '',
        },
      ],
      [
        {
          id: 'u1',
          shop_id: 's1',
          dimension: 'utm_content',
          utm_value: 'ad1',
          uv: 10,
          pv: 0,
          add_to_cart: 0,
          begin_checkout: 0,
          orders: 1,
          sales: 50,
          date_start: '2026-06-13',
          date_end: '2026-06-13',
          synced_at: '',
        },
      ],
    );
    const spendMap = buildEntityDailySpendMap([
      { entity_id: 'camp1', date: '2026-06-13', spend: 20, cpm: 2 },
    ]);
    const rows = buildEntityDailyBreakdown(
      'camp1',
      ['ad1'],
      spendMap,
      adDailyMap,
      '2026-06-13',
      '2026-06-13',
    );
    expect(rows[0].spend).toBe(20);
    expect(rows[0].utmOrders).toBe(1);
  });
});
