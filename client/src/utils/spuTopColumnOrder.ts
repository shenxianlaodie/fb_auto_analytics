import type { Key } from 'react';
import type { ColumnsType } from 'antd/es/table';

export type SpuTopColumnKey =
  | 'rank'
  | 'product'
  | 'compositeScore'
  | 'orderCount'
  | 'productCreatedAt'
  | 'addCartUsers'
  | 'viewUsers'
  | 'addToCartRate'
  | 'transformRate';

export const SPU_TOP_PINNED_LEFT_KEYS = ['drag'];

export const DEFAULT_SPU_TOP_COLUMN_ORDER: SpuTopColumnKey[] = [
  'rank',
  'product',
  'compositeScore',
  'orderCount',
  'productCreatedAt',
  'addCartUsers',
  'viewUsers',
  'addToCartRate',
  'transformRate',
];

export const SPU_TOP_COLUMN_LABELS: Record<SpuTopColumnKey, string> = {
  rank: '排名',
  product: '商品',
  compositeScore: '综合分',
  orderCount: '订单量',
  productCreatedAt: '创建时间',
  addCartUsers: '加购用户数',
  viewUsers: '浏览用户数',
  addToCartRate: '加购率',
  transformRate: '转化率',
};

function getColumnKey(col: { key?: Key; dataIndex?: unknown }): string {
  return String(col.key ?? col.dataIndex ?? '');
}

export function mergeSpuTopColumnOrder(saved?: string[]): SpuTopColumnKey[] {
  const defaults = DEFAULT_SPU_TOP_COLUMN_ORDER;
  if (!saved?.length) return [...defaults];

  const merged: SpuTopColumnKey[] = [];
  for (const key of saved) {
    if ((defaults as string[]).includes(key) && !merged.includes(key as SpuTopColumnKey)) {
      merged.push(key as SpuTopColumnKey);
    }
  }
  for (const key of defaults) {
    if (!merged.includes(key)) merged.push(key);
  }
  return merged;
}

export function applySpuTopColumnOrder<T>(
  columns: ColumnsType<T>,
  savedOrder: SpuTopColumnKey[]
): ColumnsType<T> {
  const left = columns.filter((c) =>
    SPU_TOP_PINNED_LEFT_KEYS.includes(getColumnKey(c as { key?: Key; dataIndex?: unknown }))
  );
  const middle = columns.filter(
    (c) =>
      !SPU_TOP_PINNED_LEFT_KEYS.includes(getColumnKey(c as { key?: Key; dataIndex?: unknown }))
  );

  const middleByKey = new Map(middle.map((c) => [getColumnKey(c as { key?: Key; dataIndex?: unknown }), c]));
  const middleKeys = middle.map((c) => getColumnKey(c as { key?: Key; dataIndex?: unknown }));
  const orderedKeys: string[] = [];

  for (const key of savedOrder) {
    if (middleKeys.includes(key) && !orderedKeys.includes(key)) orderedKeys.push(key);
  }
  for (const key of middleKeys) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  }

  const sortedMiddle = orderedKeys
    .map((key) => middleByKey.get(key))
    .filter((c): c is (typeof middle)[number] => !!c);

  return [...left, ...sortedMiddle];
}
