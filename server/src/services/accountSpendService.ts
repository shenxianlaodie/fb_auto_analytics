import { queryOne } from '../models/database';
import { FacebookClient } from './facebookClient';
import { getTokenForAccount } from './tokenPool';
import { wakeAccountFromDormant } from './accountDormantService';

/** 判断账户当日是否有广告花费：先查本地 fb_ads，再轻量探测 FB account insights */
export async function accountHasSpendToday(
  accountId: string,
  dateStart: string,
  dateEnd: string
): Promise<boolean> {
  const cleanId = accountId.replace('act_', '');

  const local = await queryOne(
    `SELECT 1 AS ok FROM fb_ads
     WHERE ad_account_id = $1 AND date_start = $2 AND spend > 0
     LIMIT 1`,
    [cleanId, dateStart]
  );
  if (local) return true;

  try {
    const token = await getTokenForAccount(cleanId);
    const fb = FacebookClient.getInstance();
    const spend = await fb.getAccountSpend(cleanId, token, dateStart, dateEnd);
    if (spend > 0) {
      await wakeAccountFromDormant(cleanId);
      return true;
    }
    return false;
  } catch (err: any) {
    console.warn(`[SpendProbe] account=${cleanId} failed: ${err?.message || err}`);
    return false;
  }
}
