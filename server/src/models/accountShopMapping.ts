import { query, queryOne } from './database';

export interface AccountShopMappingRecord {
  id: string;
  account_id: string;
  account_name: string | null;
  shop_id: string;
  shop_domain: string;
  shop_name: string | null;
  created_at: string;
  updated_at: string;
}

export async function listAccountShopMappings(): Promise<AccountShopMappingRecord[]> {
  return query(
    `SELECT * FROM account_shop_mapping ORDER BY updated_at DESC`
  );
}

export async function getMappingByAccountId(accountId: string): Promise<AccountShopMappingRecord | null> {
  const cleanId = accountId.replace('act_', '');
  return queryOne(
    `SELECT * FROM account_shop_mapping
     WHERE account_id IN ($1, $2)
     ORDER BY CASE WHEN account_id = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [cleanId, `act_${cleanId}`]
  );
}

export async function upsertAccountShopMapping(input: {
  accountId: string;
  accountName?: string;
  shopId: string;
  shopDomain: string;
  shopName?: string;
}): Promise<AccountShopMappingRecord> {
  const cleanId = input.accountId.replace('act_', '');
  const row = await queryOne(
    `INSERT INTO account_shop_mapping
     (account_id, account_name, shop_id, shop_domain, shop_name, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (account_id)
     DO UPDATE SET
       account_name = EXCLUDED.account_name,
       shop_id = EXCLUDED.shop_id,
       shop_domain = EXCLUDED.shop_domain,
       shop_name = EXCLUDED.shop_name,
       updated_at = NOW()
     RETURNING *`,
    [
      cleanId,
      input.accountName || null,
      input.shopId,
      input.shopDomain,
      input.shopName || null,
    ]
  );
  return row!;
}

export async function deleteAccountShopMapping(id: string): Promise<boolean> {
  const rows = await query(`DELETE FROM account_shop_mapping WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}
