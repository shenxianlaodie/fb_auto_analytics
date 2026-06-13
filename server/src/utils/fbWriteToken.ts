import { lookupAccountIdForEntity, FbEntityLevel } from '../models/fbStructure';
import { getPoolToken, getTokenForAccount } from '../services/tokenPool';

function cleanAccountId(accountId: string): string {
  return accountId.replace(/^act_/, '');
}

/** 写操作（更新/复制/删除）应使用账户绑定 Token，而非 Web 轮换 Token */
export async function resolveFbWriteToken(opts: {
  accountId?: string;
  entityId?: string;
  level?: FbEntityLevel;
}): Promise<string> {
  let accountId = opts.accountId ? cleanAccountId(opts.accountId) : null;
  if (!accountId && opts.entityId && opts.level) {
    accountId = await lookupAccountIdForEntity(opts.entityId, opts.level);
  }
  if (accountId) {
    return getTokenForAccount(accountId);
  }
  return getPoolToken();
}
