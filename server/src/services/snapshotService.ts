import { query } from '../models/database';
import { FacebookClient } from './facebookClient';
import { getUserById } from '../models/user';

interface AggregatedMetrics {
  spend: number; impressions: number; clicks: number; reach: number;
  ctr: number; cpm: number; cpc: number;
  roas: number; purchases: number; purchaseValue: number; costPerPurchase: number;
  inlineLinkClicks: number; uniqueClicks: number; costPerUniqueClick: number;
  addToCart: number; costPerAddToCart: number;
  initiateCheckout: number; costPerInitiateCheckout: number;
  addPaymentInfo: number; costPerAddPaymentInfo: number;
}

function aggregateDetailedData(rows: any[]): AggregatedMetrics {
  let spend = 0, impressions = 0, clicks = 0, reach = 0;
  let inlineLinkClicks = 0, uniqueClicks = 0;
  const actionValues: Record<string, number> = {};
  const actions: Record<string, number> = {};
  const costPerAction: Record<string, number> = {};

  for (const row of rows) {
    spend += parseFloat(row.spend || '0');
    impressions += parseInt(row.impressions || '0');
    clicks += parseInt(row.clicks || '0');
    reach += parseInt(row.reach || '0');
    inlineLinkClicks += parseInt(row.inline_link_clicks || '0');
    uniqueClicks += parseInt(row.unique_clicks || '0');
    for (const av of (row.action_values || [])) actionValues[av.action_type] = (actionValues[av.action_type] || 0) + parseFloat(av.value || '0');
    for (const a of (row.actions || [])) actions[a.action_type] = (actions[a.action_type] || 0) + parseInt(a.value || '0');
    for (const cpa of (row.cost_per_action_type || [])) costPerAction[cpa.action_type] = (costPerAction[cpa.action_type] || 0) + parseFloat(cpa.value || '0');
  }

  const purchaseValue = actionValues['purchase'] || actionValues['offsite_conversion.fb_pixel_purchase'] || 0;
  const purchases = actions['purchase'] || actions['offsite_conversion.fb_pixel_purchase'] || 0;
  const addToCart = actions['add_to_cart'] || 0;
  const initiateCheckout = actions['initiate_checkout'] || 0;
  const addPaymentInfo = actions['add_payment_info'] || 0;

  return {
    spend: Math.round(spend * 100) / 100,
    impressions, clicks, reach,
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
    cpm: impressions > 0 ? Math.round((spend / impressions) * 100000) / 100 : 0,
    cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
    roas: spend > 0 ? Math.round((purchaseValue / spend) * 100) / 100 : 0,
    purchases,
    purchaseValue: Math.round(purchaseValue * 100) / 100,
    costPerPurchase: purchases > 0 ? Math.round((spend / purchases) * 100) / 100 : 0,
    inlineLinkClicks, uniqueClicks,
    costPerUniqueClick: uniqueClicks > 0 ? Math.round((spend / uniqueClicks) * 100) / 100 : 0,
    addToCart,
    costPerAddToCart: addToCart > 0 ? Math.round((spend / addToCart) * 100) / 100 : 0,
    initiateCheckout,
    costPerInitiateCheckout: initiateCheckout > 0 ? Math.round((spend / initiateCheckout) * 100) / 100 : 0,
    addPaymentInfo,
    costPerAddPaymentInfo: addPaymentInfo > 0 ? Math.round((spend / addPaymentInfo) * 100) / 100 : 0,
  };
}

async function insertSnapshot(
  accountId: string, level: string, entityId: string, entityName: string,
  parentId: string | null, snapshotHour: string, m: AggregatedMetrics
) {
  await query(
    `INSERT INTO ad_hourly_snapshots
     (ad_account_id, level, entity_id, entity_name, parent_id, snapshot_hour,
      spend, impressions, clicks, reach, ctr, cpm, cpc,
      roas, purchases, purchase_value, cost_per_purchase,
      inline_link_clicks, unique_clicks, cost_per_unique_click,
      add_to_cart, cost_per_add_to_cart,
      initiate_checkout, cost_per_initiate_checkout,
      add_payment_info, cost_per_add_payment_info)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
    [accountId, level, entityId, entityName, parentId, snapshotHour,
     m.spend, m.impressions, m.clicks, m.reach, m.ctr, m.cpm, m.cpc,
     m.roas, m.purchases, m.purchaseValue, m.costPerPurchase,
     m.inlineLinkClicks, m.uniqueClicks, m.costPerUniqueClick,
     m.addToCart, m.costPerAddToCart,
     m.initiateCheckout, m.costPerInitiateCheckout,
     m.addPaymentInfo, m.costPerAddPaymentInfo]
  );
}

export async function runHourlySnapshot(accountId: string, accessToken: string): Promise<number> {
  const fbClient = FacebookClient.getInstance();
  const cleanId = accountId.replace('act_', '');
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  // Round to current hour
  const snapshotHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();

  let count = 0;

  // --- Campaign level ---
  try {
    const campaignsResp = await fbClient.getCampaigns(cleanId, accessToken, 200);
    const campaigns = campaignsResp.data || [];
    const campInsights = await fbClient.getInsights(cleanId, accessToken, {
      level: 'campaign', time_range: { since: today, until: today }, time_increment: 1, limit: 500,
    });

    const campMap = new Map<string, any[]>();
    for (const row of campInsights) {
      const cid = row.campaign_id;
      if (!campMap.has(cid)) campMap.set(cid, []);
      campMap.get(cid)!.push(row);
    }

    for (const camp of campaigns) {
      const rows = campMap.get(camp.id) || [];
      if (rows.length === 0) continue; // skip campaigns with no data today
      const m = aggregateDetailedData(rows);
      await insertSnapshot(cleanId, 'campaign', camp.id, camp.name, null, snapshotHour, m);
      count++;
    }
  } catch (err: any) {
    console.error('[Snapshot] Campaign level failed:', err.message);
  }

  // --- AdSet level ---
  try {
    const adsetsResp = await fbClient.getAdSets(cleanId, accessToken, undefined, 200);
    const adsets = adsetsResp.data || [];
    const adsetInsights = await fbClient.getInsights(cleanId, accessToken, {
      level: 'adset', time_range: { since: today, until: today }, time_increment: 1, limit: 500,
    });

    const adsetMap = new Map<string, any[]>();
    for (const row of adsetInsights) {
      const aid = row.adset_id;
      if (!adsetMap.has(aid)) adsetMap.set(aid, []);
      adsetMap.get(aid)!.push(row);
    }

    for (const as of adsets) {
      const rows = adsetMap.get(as.id) || [];
      if (rows.length === 0) continue;
      const m = aggregateDetailedData(rows);
      await insertSnapshot(cleanId, 'adset', as.id, as.name, as.campaign_id, snapshotHour, m);
      count++;
    }
  } catch (err: any) {
    console.error('[Snapshot] AdSet level failed:', err.message);
  }

  // --- Ad level ---
  try {
    const adsResp = await fbClient.getAds(cleanId, accessToken, {}, 500);
    const ads = adsResp.data || [];
    const adInsights = await fbClient.getInsights(cleanId, accessToken, {
      level: 'ad', time_range: { since: today, until: today }, time_increment: 1, limit: 500,
    });

    const adMap = new Map<string, any[]>();
    for (const row of adInsights) {
      const aid = row.ad_id;
      if (!adMap.has(aid)) adMap.set(aid, []);
      adMap.get(aid)!.push(row);
    }

    for (const ad of ads) {
      const rows = adMap.get(ad.id) || [];
      if (rows.length === 0) continue;
      const m = aggregateDetailedData(rows);
      await insertSnapshot(cleanId, 'ad', ad.id, ad.name, ad.adset_id, snapshotHour, m);
      count++;
    }
  } catch (err: any) {
    console.error('[Snapshot] Ad level failed:', err.message);
  }

  return count;
}

// Run for all users who have logged in
export async function runHourlySnapshotForAllUsers(): Promise<void> {
  const users = await query('SELECT id, access_token FROM users');
  if (users.length === 0) {
    console.log('[Snapshot] No users to snapshot');
    return;
  }

  // Get ad accounts: first try existing data, then fetch from Facebook
  let accounts = await query(
    'SELECT DISTINCT ad_account_id FROM cached_insights UNION SELECT DISTINCT ad_account_id FROM batch_jobs'
  );

  if (accounts.length === 0) {
    for (const user of users) {
      try {
        const fbClient = FacebookClient.getInstance();
        const fbAccounts = await fbClient.getAdAccounts(user.access_token);
        for (const acc of fbAccounts) {
          await query(
            'INSERT INTO ad_accounts (user_id, account_id, account_name, currency, timezone) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
            [user.id, acc.id, acc.name, acc.currency, acc.timezone_name]
          );
        }
      } catch (err: any) {
        console.error('[Snapshot] Failed to get accounts for user:', err.message);
      }
    }
    accounts = await query('SELECT account_id AS ad_account_id FROM ad_accounts');
  }

  console.log(`[Snapshot] Running hourly snapshot for ${accounts.length} accounts at ${new Date().toISOString()}`);

  let total = 0;
  for (const acc of accounts) {
    for (const user of users) {
      try {
        const n = await runHourlySnapshot(acc.ad_account_id, user.access_token);
        total += n;
      } catch (err: any) {
        console.error(`[Snapshot] Failed for account ${acc.ad_account_id}:`, err.message);
      }
    }
  }

  console.log(`[Snapshot] Done. Inserted ${total} rows.`);
}
