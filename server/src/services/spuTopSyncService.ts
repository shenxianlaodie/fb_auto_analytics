import { ShopCredential, getActiveShopCredentials } from '../models/shopCredential';
import {
  purgeSpuTopBefore,
  replaceShopSpuTop,
  mergeShopSpuTopMetrics,
  isManualOrder,
} from '../models/shoplazzaSpuTop';
import { ShoplazzaClient } from './shoplazzaClient';
import { isShoplazzaNonRetryableError, withShoplazzaRetry } from '../utils/shoplazzaRetry';
import { todayDateString } from '../utils/todayRange';

const SHOP_TIMEOUT_MS = 120_000;
const SHOP_MAX_RETRIES = 3;
const STALE_MS = 15 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 超时 ${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

export interface SpuTopSyncResult {
  ok: number;
  skip: number;
  totalRows: number;
  failed: Array<{ shop: string; reason: string }>;
}

export class SpuTopSyncService {
  private client = ShoplazzaClient.getInstance();

  async syncAllShopsSpuTop(statDate?: string): Promise<SpuTopSyncResult> {
    const date = statDate || todayDateString();
    await purgeSpuTopBefore(date);

    const shops = await getActiveShopCredentials();
    const result: SpuTopSyncResult = { ok: 0, skip: 0, totalRows: 0, failed: [] };

    for (const shop of shops) {
      const label = `${shop.shopId}/${shop.name}/${shop.shopDomain}`;
      try {
        const count = await withShoplazzaRetry(
          label,
          () =>
            withTimeout(
              this.syncShopSpuTop(shop, date),
              SHOP_TIMEOUT_MS,
              label
            ),
          SHOP_MAX_RETRIES
        );
        result.ok++;
        result.totalRows += count;
        console.log(`[SpuTopSync] ✅ ${label} → ${count} 条`);
      } catch (err: any) {
        result.skip++;
        const reason =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err.message ||
          'unknown';
        result.failed.push({ shop: label, reason: String(reason) });
        const tag = isShoplazzaNonRetryableError(err) ? '跳过' : '跳过(已重试)';
        console.log(`[SpuTopSync] ⏭️ ${label} → ${tag}: ${reason}`);
      }
    }

    return result;
  }

  async syncShopSpuTop(
    shop: ShopCredential,
    statDate: string,
    collectionId = '',
    collectionTitle?: string
  ): Promise<number> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(collectionId);
    const options = collectionId
      ? isUuid
        ? { collectionId, limit: 20 }
        : { collectionKeyword: collectionId, limit: 20 }
      : { limit: 20 };

    const rows = await this.client.fetchSpuTop(shop, statDate, statDate, options);

    const manual = await isManualOrder(shop.shopId, statDate, collectionId);
    const payload = {
      shopId: shop.shopId,
      shopDomain: shop.shopDomain,
      shopName: shop.name,
      statDate,
      collectionId,
      collectionTitle: collectionTitle || (collectionId || undefined),
      rows,
    };

    if (manual) {
      await mergeShopSpuTopMetrics(payload);
    } else {
      await replaceShopSpuTop(payload);
    }

    return rows.length;
  }

  isStale(syncedAt: string | null): boolean {
    if (!syncedAt) return true;
    return Date.now() - new Date(syncedAt).getTime() > STALE_MS;
  }
}

export const spuTopSyncService = new SpuTopSyncService();

export async function runSpuTopCron(): Promise<void> {
  const result = await spuTopSyncService.syncAllShopsSpuTop();
  console.log(
    `[SpuTopCron] 成功 ${result.ok} 跳过 ${result.skip} 合计 ${result.totalRows} 条`
  );
}
