import { query, queryOne } from './database';

export interface CachedInsight {
  id: string;
  ad_account_id: string;
  insight_type: string;
  date_range_start: string;
  date_range_end: string;
  breakdown: string;
  data: unknown; // JSONB — pg driver returns parsed object, not string
  created_at: string;
}

/** Parse JSONB column: pg returns object, legacy rows may be string */
export function parseJsonbData<T>(value: unknown): T {
  if (value === null || value === undefined) return value as T;
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
}

export async function getCachedInsight(
  adAccountId: string,
  insightType: string,
  dateRangeStart: string,
  dateRangeEnd: string,
  breakdown: string = ''
): Promise<CachedInsight | null> {
  return queryOne(
    `SELECT * FROM cached_insights
     WHERE ad_account_id = $1
       AND insight_type = $2
       AND date_range_start = $3
       AND date_range_end = $4
       AND breakdown = $5`,
    [adAccountId, insightType, dateRangeStart, dateRangeEnd, breakdown]
  );
}

export async function setCachedInsight(data: {
  adAccountId: string;
  insightType: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  breakdown?: string;
  jsonData: string;
}): Promise<void> {
  const breakdown = data.breakdown || '';
  await query(
    `INSERT INTO cached_insights (ad_account_id, insight_type, date_range_start, date_range_end, breakdown, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (ad_account_id, insight_type, date_range_start, date_range_end, breakdown)
     DO UPDATE SET data = EXCLUDED.data, created_at = NOW()`,
    [data.adAccountId, data.insightType, data.dateRangeStart, data.dateRangeEnd, breakdown, data.jsonData]
  );
}

export async function clearExpiredCache(maxAgeHours: number = 24): Promise<void> {
  await query(
    `DELETE FROM cached_insights
     WHERE created_at < NOW() - INTERVAL '1 hour' * $1`,
    [maxAgeHours]
  );
}
