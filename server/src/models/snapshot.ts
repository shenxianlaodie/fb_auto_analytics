import { query } from './database';

export interface SnapshotRow {
  entity_id: string;
  entity_name: string | null;
  parent_id: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpm: number;
  cpc: number;
  roas: number;
  purchases: number;
  purchase_value: number;
  cost_per_purchase: number;
  inline_link_clicks: number;
  unique_clicks: number;
  cost_per_unique_click: number;
  add_to_cart: number;
  cost_per_add_to_cart: number;
  initiate_checkout: number;
  cost_per_initiate_checkout: number;
  add_payment_info: number;
  cost_per_add_payment_info: number;
}

export async function getLatestSnapshots(
  adAccountId: string,
  level: 'campaign' | 'adset' | 'ad',
  sinceHour: string
): Promise<SnapshotRow[]> {
  const cleanId = adAccountId.replace('act_', '');
  return query(
    `SELECT DISTINCT ON (entity_id)
       entity_id, entity_name, parent_id,
       spend, impressions, clicks, reach, ctr, cpm, cpc,
       roas, purchases, purchase_value, cost_per_purchase,
       inline_link_clicks, unique_clicks, cost_per_unique_click,
       add_to_cart, cost_per_add_to_cart,
       initiate_checkout, cost_per_initiate_checkout,
       add_payment_info, cost_per_add_payment_info
     FROM ad_hourly_snapshots
     WHERE ad_account_id = $1 AND level = $2 AND snapshot_hour >= $3
     ORDER BY entity_id, snapshot_hour DESC`,
    [cleanId, level, sinceHour]
  );
}

export function snapshotToMetrics(row: SnapshotRow) {
  return {
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    reach: Number(row.reach) || 0,
    ctr: Number(row.ctr) || 0,
    cpm: Number(row.cpm) || 0,
    cpc: Number(row.cpc) || 0,
    roas: Number(row.roas) || 0,
    purchases: Number(row.purchases) || 0,
    purchaseValue: Number(row.purchase_value) || 0,
    costPerPurchase: Number(row.cost_per_purchase) || 0,
    inlineLinkClicks: Number(row.inline_link_clicks) || 0,
    uniqueClicks: Number(row.unique_clicks) || 0,
    costPerUniqueClick: Number(row.cost_per_unique_click) || 0,
    addToCart: Number(row.add_to_cart) || 0,
    costPerAddToCart: Number(row.cost_per_add_to_cart) || 0,
    initiateCheckout: Number(row.initiate_checkout) || 0,
    costPerInitiateCheckout: Number(row.cost_per_initiate_checkout) || 0,
    addPaymentInfo: Number(row.add_payment_info) || 0,
    costPerAddPaymentInfo: Number(row.cost_per_add_payment_info) || 0,
  };
}
