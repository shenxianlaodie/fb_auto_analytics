import { query, queryOne } from './database';

export type SyncType = 'structure' | 'metrics' | 'utm';

export interface SyncStateRecord {
  ad_account_id: string;
  sync_type: SyncType;
  date_start: string;
  date_end: string;
  shop_id: string;
  last_synced_at: string | null;
  refreshing: boolean;
}

export async function getSyncState(
  adAccountId: string,
  syncType: SyncType,
  dateStart: string,
  dateEnd: string,
  shopId: string = ''
): Promise<SyncStateRecord | null> {
  return queryOne(
    `SELECT * FROM sync_state
     WHERE ad_account_id = $1 AND sync_type = $2
       AND date_start = $3 AND date_end = $4 AND shop_id = $5`,
    [adAccountId, syncType, dateStart, dateEnd, shopId]
  );
}

export async function touchSyncState(
  adAccountId: string,
  syncType: SyncType,
  dateStart: string,
  dateEnd: string,
  shopId: string = ''
): Promise<void> {
  await query(
    `INSERT INTO sync_state (ad_account_id, sync_type, date_start, date_end, shop_id, last_synced_at, refreshing)
     VALUES ($1,$2,$3,$4,$5,NOW(),false)
     ON CONFLICT (ad_account_id, sync_type, date_start, date_end, shop_id)
     DO UPDATE SET last_synced_at = NOW(), refreshing = false`,
    [adAccountId, syncType, dateStart, dateEnd, shopId]
  );
}

export async function setRefreshing(
  adAccountId: string,
  syncType: SyncType,
  dateStart: string,
  dateEnd: string,
  refreshing: boolean,
  shopId: string = ''
): Promise<void> {
  await query(
    `INSERT INTO sync_state (ad_account_id, sync_type, date_start, date_end, shop_id, refreshing)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (ad_account_id, sync_type, date_start, date_end, shop_id)
     DO UPDATE SET refreshing = EXCLUDED.refreshing`,
    [adAccountId, syncType, dateStart, dateEnd, shopId, refreshing]
  );
}

export async function getLatestSyncMeta(
  adAccountId: string,
  dateStart: string,
  dateEnd: string,
  shopId: string = ''
): Promise<{
  structureSyncedAt: string | null;
  metricsSyncedAt: string | null;
  utmSyncedAt: string | null;
  refreshing: boolean;
}> {
  const rows = await query(
    `SELECT sync_type, last_synced_at, refreshing FROM sync_state
     WHERE ad_account_id = $1 AND date_start = $2 AND date_end = $3
       AND shop_id = ''`,
    [adAccountId, dateStart, dateEnd]
  );

  let structureSyncedAt: string | null = null;
  let metricsSyncedAt: string | null = null;
  let utmSyncedAt: string | null = null;
  let refreshing = false;

  for (const row of rows) {
    if (row.refreshing) refreshing = true;
    if (row.sync_type === 'structure') structureSyncedAt = row.last_synced_at;
    if (row.sync_type === 'metrics') metricsSyncedAt = row.last_synced_at;
  }

  if (shopId) {
    const utmState = await getSyncState('', 'utm', dateStart, dateEnd, shopId);
    if (utmState?.refreshing) refreshing = true;
    utmSyncedAt = utmState?.last_synced_at ?? null;
  }

  return { structureSyncedAt, metricsSyncedAt, utmSyncedAt, refreshing };
}
