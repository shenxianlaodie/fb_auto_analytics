import { getPool, query } from './database';
import { ShoplazzaSpuTopRow } from '../services/shoplazzaClient';
import { spuTopDateRange, spuTopRetentionCutoff, todayDateString } from '../utils/todayRange';

export interface ShoplazzaSpuTopRecord {
  id: string;
  shop_id: string;
  shop_domain: string;
  shop_name: string | null;
  stat_date: string;
  range_start: string | null;
  range_end: string | null;
  collection_id: string;
  collection_title: string | null;
  rank: number;
  spu: string;
  product_id: string | null;
  title: string | null;
  image_url: string | null;
  product_created_at: string | null;
  order_count: number;
  add_cart_users: number;
  view_users: number;
  add_to_cart_rate: number;
  transform_rate: number;
  composite_score: number;
  price: number;
  synced_at: string;
}

export interface ReplaceShopSpuTopInput {
  shopId: string;
  shopDomain: string;
  shopName: string;
  statDate: string;
  rangeStart: string;
  rangeEnd: string;
  collectionId: string;
  collectionTitle?: string;
  rows: ShoplazzaSpuTopRow[];
}

/** 快照是否为旧版（无 14 天范围或范围与当前 statDate 不一致） */
export function isSpuTopSnapshotOutdated(
  statDate: string,
  rows: Pick<ShoplazzaSpuTopRecord, 'range_start' | 'range_end'>[]
): boolean {
  if (rows.length === 0) return true;
  const expected = spuTopDateRange(statDate);
  const sample = rows[0];
  if (!sample.range_start || !sample.range_end) return true;
  return sample.range_start !== expected.dateStart || sample.range_end !== expected.dateEnd;
}

/** 删除超出保留期的历史快照（默认保留近 30 天） */
export async function purgeSpuTopBefore(anchorDate?: string): Promise<number> {
  const anchor = anchorDate || todayDateString();
  const cutoff = spuTopRetentionCutoff(anchor);
  const result = await query(`DELETE FROM shoplazza_spu_top WHERE stat_date < $1`, [cutoff]);
  return result.length;
}

export async function replaceShopSpuTop(input: ReplaceShopSpuTopInput): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM shoplazza_spu_top
       WHERE shop_id = $1 AND stat_date = $2 AND collection_id = $3`,
      [input.shopId, input.statDate, input.collectionId]
    );

    for (const row of input.rows) {
      await client.query(
        `INSERT INTO shoplazza_spu_top
         (shop_id, shop_domain, shop_name, stat_date, range_start, range_end, collection_id, collection_title,
          rank, spu, product_id, title, image_url, product_created_at, order_count, add_cart_users, view_users,
          add_to_cart_rate, transform_rate, composite_score, price, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())`,
        [
          input.shopId,
          input.shopDomain,
          input.shopName,
          input.statDate,
          input.rangeStart,
          input.rangeEnd,
          input.collectionId,
          input.collectionTitle ?? null,
          row.rank,
          row.spu,
          row.productId || null,
          row.title || null,
          row.imageUrl || null,
          row.productCreatedAt,
          row.orderCount,
          row.addCartUsers,
          row.viewUsers,
          row.addToCartRate,
          row.transformRate,
          row.compositeScore ?? 0,
          row.price ?? 0,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getShopSpuTop(
  statDate: string,
  shopId: string,
  collectionId = ''
): Promise<ShoplazzaSpuTopRecord[]> {
  return query(
    `SELECT * FROM shoplazza_spu_top
     WHERE stat_date = $1 AND shop_id = $2 AND collection_id = $3
     ORDER BY rank ASC`,
    [statDate, shopId, collectionId]
  );
}

export async function getAllShopsSpuTop(
  statDate: string,
  collectionId = ''
): Promise<ShoplazzaSpuTopRecord[]> {
  return query(
    `SELECT * FROM shoplazza_spu_top
     WHERE stat_date = $1 AND collection_id = $2
     ORDER BY shop_id, rank ASC`,
    [statDate, collectionId]
  );
}

export async function getSpuTopSyncedAt(
  statDate: string,
  shopId: string,
  collectionId = ''
): Promise<string | null> {
  const row = await query(
    `SELECT MAX(synced_at) AS synced_at FROM shoplazza_spu_top
     WHERE stat_date = $1 AND shop_id = $2 AND collection_id = $3`,
    [statDate, shopId, collectionId]
  );
  return row[0]?.synced_at ?? null;
}

export async function getSpuTopLatestSyncedAt(statDate: string): Promise<string | null> {
  const row = await query(
    `SELECT MAX(synced_at) AS synced_at FROM shoplazza_spu_top WHERE stat_date = $1`,
    [statDate]
  );
  return row[0]?.synced_at ?? null;
}

export async function isManualOrder(
  shopId: string,
  statDate: string,
  collectionId = ''
): Promise<boolean> {
  const row = await query(
    `SELECT manual_order FROM shoplazza_spu_top_meta
     WHERE shop_id = $1 AND stat_date = $2 AND collection_id = $3`,
    [shopId, statDate, collectionId]
  );
  return !!row[0]?.manual_order;
}

export async function clearManualOrder(
  shopId: string,
  statDate: string,
  collectionId = ''
): Promise<void> {
  await query(
    `UPDATE shoplazza_spu_top_meta
     SET manual_order = false, updated_at = NOW()
     WHERE shop_id = $1 AND stat_date = $2 AND collection_id = $3`,
    [shopId, statDate, collectionId]
  );
}

export async function clearAllManualOrders(statDate?: string): Promise<number> {
  const pool = getPool();
  const params: string[] = [];
  let sql = `UPDATE shoplazza_spu_top_meta SET manual_order = false, updated_at = NOW() WHERE manual_order = true`;
  if (statDate) {
    sql += ` AND stat_date = $1`;
    params.push(statDate);
  }
  const result = await pool.query(sql, params);
  return result.rowCount ?? 0;
}

export async function reorderShopSpuTop(
  shopId: string,
  statDate: string,
  collectionId: string,
  orderedIds: string[]
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM shoplazza_spu_top
       WHERE shop_id = $1 AND stat_date = $2 AND collection_id = $3`,
      [shopId, statDate, collectionId]
    );
    const idSet = new Set(existing.rows.map((r: { id: string }) => r.id));
    if (orderedIds.length !== idSet.size) {
      throw new Error('排序列表与当前榜单条目数不一致');
    }
    for (const id of orderedIds) {
      if (!idSet.has(id)) {
        throw new Error(`记录 ${id} 不在当前榜单中`);
      }
    }

    await client.query(
      `UPDATE shoplazza_spu_top SET rank = rank + 10000
       WHERE shop_id = $1 AND stat_date = $2 AND collection_id = $3`,
      [shopId, statDate, collectionId]
    );

    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `UPDATE shoplazza_spu_top SET rank = $1 WHERE id = $2`,
        [i + 1, orderedIds[i]]
      );
    }

    await client.query(
      `INSERT INTO shoplazza_spu_top_meta (shop_id, stat_date, collection_id, manual_order, updated_at)
       VALUES ($1, $2, $3, true, NOW())
       ON CONFLICT (shop_id, stat_date, collection_id)
       DO UPDATE SET manual_order = true, updated_at = NOW()`,
      [shopId, statDate, collectionId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function mergeShopSpuTopMetrics(input: ReplaceShopSpuTopInput): Promise<void> {
  for (const row of input.rows) {
    await query(
      `UPDATE shoplazza_spu_top SET
         title = COALESCE($5, title),
         image_url = COALESCE($6, image_url),
         product_created_at = COALESCE($7, product_created_at),
         range_start = $8,
         range_end = $9,
         order_count = $10,
         add_cart_users = $11,
         view_users = $12,
         add_to_cart_rate = $13,
         transform_rate = $14,
         composite_score = $15,
         price = $16,
         synced_at = NOW()
       WHERE shop_id = $1 AND stat_date = $2 AND collection_id = $3 AND spu = $4`,
      [
        input.shopId,
        input.statDate,
        input.collectionId,
        row.spu,
        row.title || null,
        row.imageUrl || null,
        row.productCreatedAt,
        input.rangeStart,
        input.rangeEnd,
        row.orderCount,
        row.addCartUsers,
        row.viewUsers,
        row.addToCartRate,
        row.transformRate,
        row.compositeScore ?? 0,
        row.price ?? 0,
      ]
    );
  }
}
