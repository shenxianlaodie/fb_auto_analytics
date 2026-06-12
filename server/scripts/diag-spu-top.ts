/**
 * 探针：验证 Shoplazza SPU API 请求体与响应字段（含价格探查）
 * 用法: npx tsx scripts/diag-spu-top.ts [shopDomain]
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { initDatabase } from '../src/models/database';
import { getActiveShopCredentials } from '../src/models/shopCredential';
import { ShoplazzaClient, buildShopApiBase, toShoplazzaTimeRange } from '../src/services/shoplazzaClient';
import { spuTopDateRange, todayDateString } from '../src/utils/todayRange';
import { config } from '../src/config';

const PRICE_KEYS = [
  'price',
  'product_price',
  'sale_price',
  'compare_at_price',
  'retail_price',
  'product_sales',
  'total_selling_price',
  'sales',
  'sales_total',
  'sales_total_original',
  'net_sales_total',
  'net_sales_total_original',
  'min_price',
  'max_price',
];

function pickPriceFields(row: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of PRICE_KEYS) {
    if (row[key] != null && row[key] !== '') picked[key] = row[key];
  }
  return picked;
}

async function fetchRawSpuList(
  shop: { shopDomain: string; accessToken: string },
  dateStart: string,
  dateEnd: string
): Promise<any[]> {
  const { beginTime, endTime } = toShoplazzaTimeRange(dateStart, dateEnd);
  const url = `${buildShopApiBase(shop.shopDomain)}/data-analysis/spu`;
  const resp = await axios.post(
    url,
    {
      type: 'product',
      begin_time: beginTime,
      end_time: endTime,
      time_zone: config.shoplazza.timeZone,
      page_size: 5,
      sort_by: 'order_count',
      sort_direction: 'desc',
    },
    {
      headers: {
        'access-token': shop.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 60_000,
    }
  );
  const block = resp.data?.data;
  return Array.isArray(block?.data) ? block.data : Array.isArray(block) ? block : [];
}

function analyzePriceFields(rows: any[], label: string) {
  console.log(`\n--- ${label} (${rows.length} 条) ---`);
  if (rows.length === 0) {
    console.log('  无数据');
    return { hasUnitPrice: false, hasSalesOnly: false, keys: [] as string[] };
  }

  const first = rows[0];
  const keys = Object.keys(first).sort();
  console.log('  全部字段:', keys.join(', '));
  console.log('  价格相关字段（首条）:', JSON.stringify(pickPriceFields(first), null, 2));

  let hasUnitPrice = false;
  let hasSalesOnly = false;
  for (const row of rows) {
    const picked = pickPriceFields(row);
    if (picked.price ?? picked.product_price ?? picked.sale_price ?? picked.retail_price) {
      hasUnitPrice = true;
    }
    if (
      picked.product_sales ??
      picked.total_selling_price ??
      picked.sales ??
      picked.sales_total ??
      picked.net_sales_total
    ) {
      hasSalesOnly = true;
    }
  }

  const orders = Number(first.order_count_original ?? first.order_count ?? 0);
  const sales = Number(
    first.sales_total_original ??
      first.sales_total ??
      first.net_sales_total_original ??
      first.net_sales_total ??
      first.product_sales ??
      first.sales ??
      first.total_selling_price ??
      0
  );
  if (sales > 0 && orders > 0) {
    console.log(`  首条均价估算 (sales/orders): ${(sales / orders).toFixed(2)}`);
  }

  return { hasUnitPrice, hasSalesOnly, keys };
}

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
  const range14 = spuTopDateRange(today);
  const client = ShoplazzaClient.getInstance();

  console.log(`\n=== SPU TOP 探针: ${shop.shopDomain} (${today}) ===`);

  const singleDay = await fetchRawSpuList(shop, today, today);
  const rolling14 = await fetchRawSpuList(shop, range14.dateStart, range14.dateEnd);

  const single = analyzePriceFields(singleDay, '单日窗口');
  const rolling = analyzePriceFields(rolling14, `14天窗口 ${range14.dateStart} ~ ${range14.dateEnd}`);

  console.log('\n=== 价格探查结论 ===');
  if (single.hasSalesOnly || rolling.hasSalesOnly) {
    console.log('  SPU API 无单价，含总销售额字段 → 均价 = sales_total / order_count');
  } else {
    console.log('  SPU API 未检测到 sales_total 字段，无法计算均价');
  }

  const keysMatch =
    single.keys.length === rolling.keys.length &&
    single.keys.every((k, i) => k === rolling.keys[i]);
  console.log(`  单日 vs 14天字段一致: ${keysMatch ? '是' : '否'}`);

  try {
    const rows = await client.fetchSpuTop(shop, range14.dateStart, range14.dateEnd);
    console.log(`\n归一化 TOP ${rows.length} 条（14天窗口）`);
    if (rows[0]) {
      console.log('  首条:', {
        spu: rows[0].spu,
        orderCount: rows[0].orderCount,
        viewUsers: rows[0].viewUsers,
        price: rows[0].price,
        compositeScore: rows[0].compositeScore,
      });
    }
  } catch (err: any) {
    console.error('\nfetchSpuTop 失败:', err.message);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('脚本异常:', err.message);
  process.exit(1);
});
