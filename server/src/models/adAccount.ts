import { query, queryOne } from './database';

function normalizeAccountId(id: string): string {
  return id.replace(/^act_/, '');
}

function toFbAccount(row: {
  account_id: string;
  account_name: string | null;
  currency: string | null;
  timezone: string | null;
  is_active: boolean | null;
}) {
  const cleanId = normalizeAccountId(row.account_id);
  return {
    id: `act_${cleanId}`,
    name: row.account_name || cleanId,
    account_id: cleanId,
    currency: row.currency || 'USD',
    timezone_name: row.timezone || 'Asia/Shanghai',
    account_status: row.is_active !== false ? 1 : 2,
  };
}

/** 全库账户目录（各用户同步结果的并集，取每个 account_id 最新一条） */
export async function getGlobalAccountCatalog(): Promise<any[]> {
  const rows = await query(
    `SELECT DISTINCT ON (account_id) account_id, account_name, currency, timezone, is_active
     FROM ad_accounts
     WHERE account_id IS NOT NULL
     ORDER BY account_id, account_name`
  );
  return rows.map(toFbAccount);
}

/** Facebook 不可用时，将全库账户目录同步到指定用户 */
export async function propagateGlobalAccountsToUser(userId: string): Promise<number> {
  const catalog = await getGlobalAccountCatalog();
  if (catalog.length === 0) return 0;
  await upsertAccountsForUser(userId, catalog);
  return catalog.length;
}

export async function getAllDistinctAccountIds(): Promise<string[]> {
  const rows = await query(
    `SELECT DISTINCT account_id FROM ad_accounts WHERE account_id IS NOT NULL ORDER BY account_id`
  );
  return rows.map((r) => normalizeAccountId(String(r.account_id)));
}

export async function getCachedAccountsForUser(userId: string): Promise<any[]> {
  const rows = await query(
    `SELECT account_id, account_name, currency, timezone, is_active
     FROM ad_accounts
     WHERE user_id = $1
     ORDER BY account_name`,
    [userId]
  );
  return rows.map(toFbAccount);
}

export async function upsertAccountsForUser(userId: string, accounts: any[]): Promise<void> {
  for (const acc of accounts) {
    const cleanId = normalizeAccountId(acc.account_id || acc.id || '');
    if (!cleanId) continue;

    const existing = await queryOne(
      `SELECT id FROM ad_accounts
       WHERE user_id = $1 AND account_id IN ($2, $3)
       LIMIT 1`,
      [userId, cleanId, `act_${cleanId}`]
    );

    const isActive = acc.account_status === 1 || acc.account_status === 'ACTIVE';

    if (existing) {
      await query(
        `UPDATE ad_accounts
         SET account_name = $1, currency = $2, timezone = $3, is_active = $4
         WHERE id = $5`,
        [acc.name, acc.currency, acc.timezone_name, isActive, existing.id]
      );
    } else {
      await query(
        `INSERT INTO ad_accounts (user_id, account_id, account_name, currency, timezone, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, cleanId, acc.name, acc.currency, acc.timezone_name, isActive]
      );
    }
  }
}
