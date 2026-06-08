import { query } from './database';

export type UtmDimension = 'utm_content' | 'utm_campaign';

export interface ShoplazzaUtmRecord {
  id: string;
  shop_id: string;
  dimension: UtmDimension;
  utm_value: string;
  uv: number;
  pv: number;
  add_to_cart: number;
  begin_checkout: number;
  orders: number;
  sales: number;
  date_start: string;
  date_end: string;
  synced_at: string;
}

export interface ShoplazzaUtmUpsertInput {
  shopId: string;
  dimension: UtmDimension;
  utmValue: string;
  uv: number;
  pv: number;
  addToCart: number;
  beginCheckout: number;
  orders: number;
  sales: number;
  dateStart: string;
  dateEnd: string;
}

export async function upsertShoplazzaUtm(input: ShoplazzaUtmUpsertInput): Promise<void> {
  await query(
    `INSERT INTO shoplazza_utm
     (shop_id, dimension, utm_value, uv, pv, add_to_cart, begin_checkout, orders, sales, date_start, date_end, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
     ON CONFLICT (shop_id, dimension, utm_value, date_start, date_end)
     DO UPDATE SET
       uv = EXCLUDED.uv,
       pv = EXCLUDED.pv,
       add_to_cart = EXCLUDED.add_to_cart,
       begin_checkout = EXCLUDED.begin_checkout,
       orders = EXCLUDED.orders,
       sales = EXCLUDED.sales,
       synced_at = NOW()`,
    [
      input.shopId,
      input.dimension,
      input.utmValue,
      input.uv,
      input.pv,
      input.addToCart,
      input.beginCheckout,
      input.orders,
      input.sales,
      input.dateStart,
      input.dateEnd,
    ]
  );
}

/** 本账户广告 ID 有对应 utm_content 的行（JOIN ad_id=utm_value；shopId 可选） */
export async function getShoplazzaUtmForAccount(
  adAccountId: string,
  dateStart: string,
  dateEnd: string,
  shopId?: string
): Promise<ShoplazzaUtmRecord[]> {
  if (shopId) {
    return query(
      `SELECT u.* FROM shoplazza_utm u
       INNER JOIN fb_ads_meta m
         ON m.ad_id = u.utm_value AND m.ad_account_id = $1
       WHERE u.shop_id = $2
         AND u.date_start = $3 AND u.date_end = $4
         AND u.dimension = 'utm_content'
       ORDER BY u.sales DESC`,
      [adAccountId, shopId, dateStart, dateEnd]
    );
  }
  return query(
    `SELECT u.* FROM shoplazza_utm u
     INNER JOIN fb_ads_meta m
       ON m.ad_id = u.utm_value AND m.ad_account_id = $1
     WHERE u.date_start = $2 AND u.date_end = $3
       AND u.dimension = 'utm_content'
     ORDER BY u.sales DESC`,
    [adAccountId, dateStart, dateEnd]
  );
}

export async function getShoplazzaUtmByDateRange(
  dateStart: string,
  dateEnd: string,
  dimension?: UtmDimension,
  shopId?: string
): Promise<ShoplazzaUtmRecord[]> {
  if (dimension && shopId) {
    return query(
      `SELECT * FROM shoplazza_utm
       WHERE date_start = $1 AND date_end = $2 AND dimension = $3 AND shop_id = $4
       ORDER BY sales DESC`,
      [dateStart, dateEnd, dimension, shopId]
    );
  }
  if (dimension) {
    return query(
      `SELECT * FROM shoplazza_utm
       WHERE date_start = $1 AND date_end = $2 AND dimension = $3
       ORDER BY sales DESC`,
      [dateStart, dateEnd, dimension]
    );
  }
  if (shopId) {
    return query(
      `SELECT * FROM shoplazza_utm
       WHERE date_start = $1 AND date_end = $2 AND shop_id = $3
       ORDER BY dimension, sales DESC`,
      [dateStart, dateEnd, shopId]
    );
  }
  return query(
    `SELECT * FROM shoplazza_utm
     WHERE date_start = $1 AND date_end = $2
     ORDER BY dimension, sales DESC`,
    [dateStart, dateEnd]
  );
}
