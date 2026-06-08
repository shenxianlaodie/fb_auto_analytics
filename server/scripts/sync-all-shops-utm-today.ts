/**
 * 一次性拉取所有店铺今天的 UTM 数据，失败跳过。
 * 用法: npx tsx scripts/sync-all-shops-utm-today.ts
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { initDatabase } from '../src/models/database';
import { getActiveShopCredentials } from '../src/models/shopCredential';
import { UtmMatchService } from '../src/services/utmMatchService';
import { touchSyncState } from '../src/models/syncState';
import { todayDateString } from '../src/utils/todayRange';
import { isShoplazzaNonRetryableError, withShoplazzaRetry } from '../src/utils/shoplazzaRetry';

const SHOP_TIMEOUT_MS = 120_000;
const SHOP_MAX_RETRIES = 3;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 超时 ${ms}ms`)), ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

async function main() {
  await initDatabase();

  const today = todayDateString();
  const shops = await getActiveShopCredentials();
  const utmMatch = new UtmMatchService();

  console.log(`日期: ${today}`);
  console.log(`店铺总数: ${shops.length}\n`);

  if (shops.length === 0) {
    console.log('未配置店铺 Token，请先在「店铺 Token」页面添加。');
    process.exit(0);
  }

  let ok = 0;
  let skip = 0;
  let totalRows = 0;
  const failed: Array<{ shop: string; reason: string }> = [];

  for (const shop of shops) {
    const label = `${shop.shopId}/${shop.name}/${shop.shopDomain}`;
    try {
      const result = await withShoplazzaRetry(
        label,
        () =>
          withTimeout(
            utmMatch.syncShoplazzaUtm(shop, today, today),
            SHOP_TIMEOUT_MS,
            label
          ),
        SHOP_MAX_RETRIES
      );
      await touchSyncState('', 'utm', today, today, shop.shopId);
      ok++;
      totalRows += result.utmContent;
      console.log(`✅ ${label} → ${result.utmContent} 条`);
    } catch (err: any) {
      skip++;
      const reason =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err.message ||
        'unknown';
      failed.push({ shop: label, reason: String(reason) });
      const tag = isShoplazzaNonRetryableError(err) ? '跳过' : '跳过(已重试)';
      console.log(`⏭️  ${label} → ${tag}: ${reason}`);
    }
  }

  console.log('\n=== 汇总 ===');
  console.log(`成功: ${ok}  跳过: ${skip}  合计 UTM 行: ${totalRows}`);
  if (failed.length > 0) {
    console.log('\n跳过明细:');
    for (const f of failed) {
      console.log(`  - ${f.shop}: ${f.reason}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('脚本异常:', err.message);
  process.exit(1);
});
