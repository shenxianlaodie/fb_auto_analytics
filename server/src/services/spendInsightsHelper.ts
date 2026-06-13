import { FacebookClient } from './facebookClient';

/** FB insights 筛选：仅 spend > 0 的广告 */
export const INSIGHTS_SPEND_FILTER = JSON.stringify([
  { field: 'spend', operator: 'GREATER_THAN', value: '0' },
]);

export const AD_INSIGHT_FIELDS =
  'ad_id,ad_name,adset_id,campaign_id,spend,cpm,date_start,date_stop';

export interface AdSpendInsightRow {
  ad_id: string;
  ad_name?: string;
  adset_id?: string;
  campaign_id?: string;
  spend: number;
  cpm: number;
  date_start?: string;
  date_stop?: string;
}

export function parseAdSpendInsightRows(rows: any[]): AdSpendInsightRow[] {
  const out: AdSpendInsightRow[] = [];
  for (const row of rows) {
    if (!row.ad_id) continue;
    const spend = parseFloat(row.spend || '0');
    if (spend <= 0) continue;
    out.push({
      ad_id: String(row.ad_id),
      ad_name: row.ad_name,
      adset_id: row.adset_id ? String(row.adset_id) : undefined,
      campaign_id: row.campaign_id ? String(row.campaign_id) : undefined,
      spend,
      cpm: parseFloat(row.cpm || '0'),
      date_start: row.date_start,
      date_stop: row.date_stop,
    });
  }
  return out;
}

/** 拉取日期范围内有花费的广告 insights（按天返回，便于入库与按日细分） */
export async function fetchAdInsightsWithSpend(
  fbClient: FacebookClient,
  accountId: string,
  accessToken: string,
  dateStart: string,
  dateEnd: string
): Promise<AdSpendInsightRow[]> {
  const cleanId = accountId.replace('act_', '');
  const rows = await fbClient.getInsights(cleanId, accessToken, {
    level: 'ad',
    fields: AD_INSIGHT_FIELDS,
    time_range: { since: dateStart, until: dateEnd },
    time_increment: 1,
    filtering: INSIGHTS_SPEND_FILTER,
    limit: 500,
  });
  return parseAdSpendInsightRows(rows);
}
