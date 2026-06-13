import { FbAdRecord } from '../models/fbAd';
import { ShoplazzaUtmRecord } from '../models/shoplazzaUtm';
import { enumerateDatesDesc } from '../utils/dateRange';

export interface DailyBreakdownRow {
  date: string;
  spend: number;
  cpm: number;
  utmUv: number;
  utmAddToCart: number;
  utmBeginCheckout: number;
  utmOrders: number;
  utmSales: number;
  utmBounceRate: number;
}

interface AdDayMetrics {
  spend: number;
  cpmWeighted: number;
  cpmWeight: number;
  utmUv: number;
  utmAddToCart: number;
  utmBeginCheckout: number;
  utmOrders: number;
  utmSales: number;
  bounceRateWeighted: number;
}

function emptyDayMetrics(): AdDayMetrics {
  return {
    spend: 0,
    cpmWeighted: 0,
    cpmWeight: 0,
    utmUv: 0,
    utmAddToCart: 0,
    utmBeginCheckout: 0,
    utmOrders: 0,
    utmSales: 0,
    bounceRateWeighted: 0,
  };
}

function addSpendCpm(m: AdDayMetrics, spend: number, cpm: number) {
  m.spend += spend;
  if (cpm > 0 && spend > 0) {
    m.cpmWeighted += spend * cpm;
    m.cpmWeight += spend;
  }
}

function toDailyRow(date: string, m: AdDayMetrics): DailyBreakdownRow {
  return {
    date,
    spend: Math.round(m.spend * 100) / 100,
    cpm: m.cpmWeight > 0 ? Math.round((m.cpmWeighted / m.cpmWeight) * 100) / 100 : 0,
    utmUv: m.utmUv,
    utmAddToCart: m.utmAddToCart,
    utmBeginCheckout: m.utmBeginCheckout,
    utmOrders: m.utmOrders,
    utmSales: Math.round(m.utmSales * 100) / 100,
    utmBounceRate: m.utmUv > 0
      ? Math.round((m.bounceRateWeighted / m.utmUv) * 10000) / 10000
      : 0,
  };
}

function mergeDayMetrics(target: AdDayMetrics, source: AdDayMetrics) {
  target.spend += source.spend;
  target.cpmWeighted += source.cpmWeighted;
  target.cpmWeight += source.cpmWeight;
  target.utmUv += source.utmUv;
  target.utmAddToCart += source.utmAddToCart;
  target.utmBeginCheckout += source.utmBeginCheckout;
  target.utmOrders += source.utmOrders;
  target.utmSales += source.utmSales;
  target.bounceRateWeighted += source.bounceRateWeighted;
}

/** 构建广告 × 日期 指标映射 */
export function buildAdDailyMetricsMap(
  fbAdsDaily: FbAdRecord[],
  utmDaily: ShoplazzaUtmRecord[]
): Map<string, Map<string, AdDayMetrics>> {
  const byAd = new Map<string, Map<string, AdDayMetrics>>();

  const ensure = (adId: string, date: string) => {
    if (!byAd.has(adId)) byAd.set(adId, new Map());
    const byDate = byAd.get(adId)!;
    if (!byDate.has(date)) byDate.set(date, emptyDayMetrics());
    return byDate.get(date)!;
  };

  for (const row of fbAdsDaily) {
    const adId = String(row.ad_id).trim();
    const date = String(row.date_start).trim();
    const m = ensure(adId, date);
    addSpendCpm(m, Number(row.spend) || 0, Number(row.cpm) || 0);
  }

  for (const row of utmDaily) {
    const adId = String(row.utm_value).trim();
    const date = row.date_start;
    const m = ensure(adId, date);
    const uv = Number(row.uv) || 0;
    m.utmUv += uv;
    m.utmAddToCart += Number(row.add_to_cart) || 0;
    m.utmBeginCheckout += Number(row.begin_checkout) || 0;
    m.utmOrders += Number(row.orders) || 0;
    m.utmSales += Number(row.sales) || 0;
    m.bounceRateWeighted += (Number(row.escape_rate) || 0) * uv;
  }

  return byAd;
}

/** 从子广告按日 rollup 到系列/广告组 */
export function rollupDailyBreakdown(
  childAdIds: string[],
  adDailyMap: Map<string, Map<string, AdDayMetrics>>,
  dateStart: string,
  dateEnd: string
): DailyBreakdownRow[] {
  const dates = enumerateDatesDesc(dateStart, dateEnd);
  return dates.map((date) => {
    const merged = emptyDayMetrics();
    for (const adId of childAdIds) {
      const day = adDailyMap.get(String(adId).trim())?.get(date);
      if (day) mergeDayMetrics(merged, day);
    }
    return toDailyRow(date, merged);
  });
}

/** 单广告按日明细 */
export function dailyBreakdownForAd(
  adId: string,
  adDailyMap: Map<string, Map<string, AdDayMetrics>>,
  dateStart: string,
  dateEnd: string
): DailyBreakdownRow[] {
  const dates = enumerateDatesDesc(dateStart, dateEnd);
  const byDate = adDailyMap.get(String(adId).trim());
  return dates.map((date) => toDailyRow(date, byDate?.get(date) ?? emptyDayMetrics()));
}

export function isMultiDayRange(dateStart: string, dateEnd: string): boolean {
  return dateStart !== dateEnd;
}

/** 将 SQL 按实体×日汇总转为 Map */
export function buildEntityDailySpendMap(
  rows: Array<{ entity_id: string; date: string; spend: number; cpm: number }>
): Map<string, Map<string, { spend: number; cpm: number }>> {
  const out = new Map<string, Map<string, { spend: number; cpm: number }>>();
  for (const row of rows) {
    const entityId = String(row.entity_id).trim();
    const date = String(row.date).trim();
    if (!out.has(entityId)) out.set(entityId, new Map());
    out.get(entityId)!.set(date, {
      spend: Number(row.spend) || 0,
      cpm: Number(row.cpm) || 0,
    });
  }
  return out;
}

/** 系列/组：spend 用 SQL 汇总，UTM 用子广告 rollup */
export function buildEntityDailyBreakdown(
  entityId: string,
  childAdIds: string[],
  spendMap: Map<string, Map<string, { spend: number; cpm: number }>>,
  adDailyMap: Map<string, Map<string, AdDayMetrics>>,
  dateStart: string,
  dateEnd: string
): DailyBreakdownRow[] {
  const utmOnly = rollupDailyBreakdown(childAdIds, adDailyMap, dateStart, dateEnd);
  return mergeEntityDailyBreakdown(entityId, spendMap, utmOnly, dateStart, dateEnd);
}

/** 合并 spend（SQL 汇总）与 UTM（广告 rollup）为完整按日行 */
export function mergeEntityDailyBreakdown(
  entityId: string,
  spendMap: Map<string, Map<string, { spend: number; cpm: number }>>,
  utmRows: DailyBreakdownRow[],
  dateStart: string,
  dateEnd: string
): DailyBreakdownRow[] {
  const dates = enumerateDatesDesc(dateStart, dateEnd);
  const spendByDate = spendMap.get(String(entityId).trim());
  const utmByDate = new Map(utmRows.map((r) => [r.date, r]));
  return dates.map((date) => {
    const spend = spendByDate?.get(date);
    const utm = utmByDate.get(date);
    return {
      date,
      spend: Math.round((spend?.spend ?? 0) * 100) / 100,
      cpm: Math.round((spend?.cpm ?? 0) * 100) / 100,
      utmUv: utm?.utmUv ?? 0,
      utmAddToCart: utm?.utmAddToCart ?? 0,
      utmBeginCheckout: utm?.utmBeginCheckout ?? 0,
      utmOrders: utm?.utmOrders ?? 0,
      utmSales: utm?.utmSales ?? 0,
      utmBounceRate: utm?.utmBounceRate ?? 0,
    };
  });
}
