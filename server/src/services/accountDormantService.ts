import { query, queryOne } from '../models/database';

const DORMANT_STREAK_THRESHOLD = 3;
const DORMANT_STRUCTURE_TTL_MS = 24 * 60 * 60 * 1000;

/** 连续 structure 结果为 0 后标记 dormant */
export async function recordStructureResult(
  accountId: string,
  campaigns: number,
  adsets: number,
  ads: number
): Promise<void> {
  const cleanId = accountId.replace('act_', '');
  const isEmpty = campaigns === 0 && adsets === 0 && ads === 0;

  const row = await queryOne(
    `SELECT id, empty_structure_streak, dormant_since FROM ad_accounts
     WHERE account_id IN ($1, $2) LIMIT 1`,
    [cleanId, `act_${cleanId}`]
  );
  if (!row) return;

  if (isEmpty) {
    const streak = (row.empty_structure_streak || 0) + 1;
    const dormantSince =
      streak >= DORMANT_STREAK_THRESHOLD ? row.dormant_since || new Date().toISOString() : null;
    await query(
      `UPDATE ad_accounts SET empty_structure_streak = $1, dormant_since = $2 WHERE id = $3`,
      [streak, dormantSince, row.id]
    );
    if (streak >= DORMANT_STREAK_THRESHOLD && !row.dormant_since) {
      console.log(`[Dormant] account=${cleanId} 标记为休眠（连续 ${streak} 次空结构）`);
    }
  } else {
    await query(
      `UPDATE ad_accounts SET empty_structure_streak = 0, dormant_since = NULL WHERE id = $1`,
      [row.id]
    );
  }
}

export async function isDormantAccount(accountId: string): Promise<boolean> {
  const cleanId = accountId.replace('act_', '');
  const row = await queryOne(
    `SELECT dormant_since FROM ad_accounts WHERE account_id IN ($1, $2) LIMIT 1`,
    [cleanId, `act_${cleanId}`]
  );
  return !!row?.dormant_since;
}

/** dormant 账户跳过 metrics；structure 仅 24h 抽查 */
export async function shouldSkipMetrics(accountId: string): Promise<boolean> {
  return isDormantAccount(accountId);
}

export async function shouldSkipStructure(
  accountId: string,
  lastSyncedAt: string | null | undefined
): Promise<boolean> {
  const dormant = await isDormantAccount(accountId);
  if (!dormant) return false;
  if (!lastSyncedAt) return false;
  return Date.now() - new Date(lastSyncedAt).getTime() < DORMANT_STRUCTURE_TTL_MS;
}

/** 探测到当日有花费时解除休眠，恢复常规同步 */
export async function wakeAccountFromDormant(accountId: string): Promise<void> {
  const cleanId = accountId.replace('act_', '');
  const row = await queryOne(
    `SELECT id FROM ad_accounts
     WHERE account_id IN ($1, $2) AND dormant_since IS NOT NULL
     LIMIT 1`,
    [cleanId, `act_${cleanId}`]
  );
  if (!row) return;
  await query(
    `UPDATE ad_accounts SET empty_structure_streak = 0, dormant_since = NULL WHERE id = $1`,
    [row.id]
  );
  console.log(`[Dormant] account=${cleanId} 检测到花费，解除休眠`);
}

export { DORMANT_STRUCTURE_TTL_MS };
