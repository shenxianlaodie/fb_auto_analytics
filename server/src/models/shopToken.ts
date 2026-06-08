import { query, queryOne } from './database';

export interface ShopTokenRecord {
  id: string;
  shop_id: string;
  shop_domain: string;
  shop_name: string | null;
  access_token: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShopTokenPublic {
  id: string;
  shop_id: string;
  shop_domain: string;
  shop_name: string | null;
  token_preview: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function maskToken(token: string): string {
  if (!token || token.length <= 4) return '****';
  return `****${token.slice(-4)}`;
}

function toPublic(row: ShopTokenRecord): ShopTokenPublic {
  return {
    id: row.id,
    shop_id: row.shop_id,
    shop_domain: row.shop_domain,
    shop_name: row.shop_name,
    token_preview: maskToken(row.access_token),
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listShopTokens(): Promise<ShopTokenPublic[]> {
  const rows = await query(
    `SELECT * FROM shop_tokens ORDER BY updated_at DESC`
  );
  return rows.map(toPublic);
}

export async function getShopTokenRecordById(id: string): Promise<ShopTokenRecord | null> {
  return queryOne(`SELECT * FROM shop_tokens WHERE id = $1 LIMIT 1`, [id]);
}

export async function getShopTokenById(shopId: string): Promise<ShopTokenRecord | null> {
  return queryOne(
    `SELECT * FROM shop_tokens WHERE shop_id = $1 LIMIT 1`,
    [shopId]
  );
}

export async function getShopTokenByDomain(shopDomain: string): Promise<ShopTokenRecord | null> {
  return queryOne(
    `SELECT * FROM shop_tokens WHERE shop_domain = $1 LIMIT 1`,
    [shopDomain]
  );
}

export async function getShopTokenByName(shopName: string): Promise<ShopTokenRecord | null> {
  return queryOne(
    `SELECT * FROM shop_tokens WHERE shop_name = $1 LIMIT 1`,
    [shopName]
  );
}

export async function getActiveShopTokens(): Promise<ShopTokenRecord[]> {
  return query(
    `SELECT * FROM shop_tokens
     WHERE is_active = true
       AND access_token IS NOT NULL
       AND length(access_token) > 0
     ORDER BY shop_domain`
  );
}

export async function upsertShopToken(input: {
  shopId: string;
  shopDomain: string;
  shopName?: string;
  accessToken?: string;
  isActive?: boolean;
}): Promise<ShopTokenPublic> {
  const domain = input.shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const existing = await getShopTokenById(input.shopId);

  if (existing) {
    const token = input.accessToken?.trim() || existing.access_token;
    const row = await queryOne(
      `UPDATE shop_tokens SET
         shop_domain = $2,
         shop_name = $3,
         access_token = $4,
         is_active = COALESCE($5, is_active),
         updated_at = NOW()
       WHERE shop_id = $1
       RETURNING *`,
      [
        input.shopId,
        domain,
        input.shopName ?? existing.shop_name,
        token,
        input.isActive ?? null,
      ]
    );
    return toPublic(row!);
  }

  if (!input.accessToken?.trim()) {
    throw new Error('新建店铺必须填写 access token');
  }

  const row = await queryOne(
    `INSERT INTO shop_tokens (shop_id, shop_domain, shop_name, access_token, is_active, updated_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, true), NOW())
     RETURNING *`,
    [
      input.shopId,
      domain,
      input.shopName || null,
      input.accessToken.trim(),
      input.isActive ?? true,
    ]
  );
  return toPublic(row!);
}

export async function deleteShopToken(id: string): Promise<boolean> {
  const rows = await query(`DELETE FROM shop_tokens WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}
