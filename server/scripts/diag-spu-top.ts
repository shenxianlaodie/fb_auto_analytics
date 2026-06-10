/**
 * 探针：验证 Shoplazza SPU API 请求体与响应字段
 * 用法: npx tsx scripts/diag-spu-top.ts [shopDomain]
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { initDatabase } from '../src/models/database';
import { getActiveShopCredentials } from '../src/models/shopCredential';
import { ShoplazzaClient } from '../src/services/shoplazzaClient';
import { todayDateString } from '../src/utils/todayRange';

async function main() {
  await initDatabase();

  const targetDomain = process.argv[2];
  const shops = await getActiveShopCredentials();
  const shop = targetDomain
    ? shops.find((s) => s.shopDomain.includes(targetDomain))
    : shops[0];

  if (!shop) {
    console.log('未找到店铺，可用:', shops.map((s) => s.shopDomain).join(', '));
    process.exit(1);
  }

  const today = todayDateString();
  const client = ShoplazzaClient.getInstance();

  console.log(`\n=== SPU TOP 探针: ${shop.shopDomain} (${today}) ===\n`);

  try {
    const rows = await client.fetchSpuTop(shop, today, today);
    console.log(`获取 ${rows.length} 条 TOP SPU\n`);
    if (rows.length > 0) {
      console.log('首条归一化结果:');
      console.log(JSON.stringify(rows[0], null, 2));
      console.log('\n前 3 条摘要:');
      for (const r of rows.slice(0, 3)) {
        console.log(`  #${r.rank} spu=${r.spu} orders=${r.orderCount} views=${r.viewUsers} addCart=${r.addCartUsers}`);
      }
    }
  } catch (err: any) {
    console.error('SPU API 失败:', err.message);
    if (err.response?.data) {
      console.error('响应:', JSON.stringify(err.response.data, null, 2));
    }
  }

  try {
    const collections = await client.fetchCollections(shop);
    console.log(`\n专辑数量: ${collections.length}`);
    if (collections.length > 0) {
      console.log('前 3 个专辑:', collections.slice(0, 3).map((c) => `${c.title} (${c.id})`).join(', '));
    }
  } catch (err: any) {
    console.error('Collections API 失败:', err.message);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('脚本异常:', err.message);
  process.exit(1);
});
