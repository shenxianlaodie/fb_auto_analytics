import {
  getActiveShopTokens,
  getShopTokenByDomain,
  getShopTokenById,
  getShopTokenByName,
  ShopTokenRecord,
} from './shopToken';

export interface ShopCredential {
  shopId: string;
  shopDomain: string;
  name: string;
  accessToken: string;
}

function mapCredential(row: ShopTokenRecord): ShopCredential {
  return {
    shopId: row.shop_id,
    shopDomain: row.shop_domain,
    name: row.shop_name || row.shop_domain,
    accessToken: row.access_token,
  };
}

export async function getShopCredentialById(shopId: string): Promise<ShopCredential | null> {
  const row = await getShopTokenById(shopId);
  if (!row || !row.is_active) return null;
  return mapCredential(row);
}

export async function getShopCredentialByDomain(shopDomain: string): Promise<ShopCredential | null> {
  const row = await getShopTokenByDomain(shopDomain);
  if (!row || !row.is_active) return null;
  return mapCredential(row);
}

export async function getShopCredentialByName(shopName: string): Promise<ShopCredential | null> {
  const row = await getShopTokenByName(shopName);
  if (!row || !row.is_active) return null;
  return mapCredential(row);
}

export async function getActiveShopCredentials(): Promise<ShopCredential[]> {
  const rows = await getActiveShopTokens();
  return rows.map(mapCredential);
}

/** 从 FB 广告账户名中解析店铺编号，例如 xiaoyi-289659-Aniechic-... */
export async function findShopByAccountName(accountName: string): Promise<ShopCredential | null> {
  const parts = accountName.split(/[-_\s]+/);
  for (const part of parts) {
    if (!/^\d{4,}$/.test(part)) continue;
    const cred = await getShopCredentialByName(part);
    if (cred) return cred;
  }
  return null;
}
