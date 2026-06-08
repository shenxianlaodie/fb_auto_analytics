import { queryOne } from '../models/database';
import { getMappingByAccountId } from '../models/accountShopMapping';
import {
  findShopByAccountName,
  getShopCredentialByDomain,
  getShopCredentialById,
  ShopCredential,
} from '../models/shopCredential';

export interface ShopResolveInput {
  shopId?: string;
  shopDomain?: string;
  accountId?: string;
  accountName?: string;
}

export class ShopTokenService {
  async resolveShop(input: ShopResolveInput): Promise<ShopCredential> {
    if (input.accountId) {
      const cleanId = input.accountId.replace('act_', '');
      const mapping = await getMappingByAccountId(cleanId);
      if (mapping) {
        const cred = await getShopCredentialById(mapping.shop_id);
        if (cred) return cred;
        const byDomain = await getShopCredentialByDomain(mapping.shop_domain);
        if (byDomain) return byDomain;
      }
    }

    if (input.shopId) {
      const cred = await getShopCredentialById(input.shopId);
      if (cred) return cred;
      throw new Error(`未在 shoplazza 库找到店铺 shopId=${input.shopId}`);
    }

    if (input.shopDomain) {
      const cred = await getShopCredentialByDomain(input.shopDomain);
      if (cred) return cred;
      throw new Error(`未在 shoplazza 库找到店铺 shopDomain=${input.shopDomain}`);
    }

    if (input.accountName) {
      const cred = await findShopByAccountName(input.accountName);
      if (cred) return cred;
    }

    if (input.accountId) {
      const cleanId = input.accountId.replace('act_', '');
      const account = await queryOne(
        `SELECT account_name FROM ad_accounts
         WHERE account_id IN ($1, $2)
         ORDER BY CASE WHEN account_id = $1 THEN 0 ELSE 1 END
         LIMIT 1`,
        [cleanId, `act_${cleanId}`]
      );
      if (account?.account_name) {
        const cred = await findShopByAccountName(account.account_name);
        if (cred) return cred;
      }
    }

    throw new Error('请提供 shopId、shopDomain，或确保广告账户名可匹配 shoplazza 店铺编号');
  }
}
