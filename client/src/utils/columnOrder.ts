import type { Key } from 'react';
import type { ColumnsType } from 'antd/es/table';

export type TableLevel = 'campaign' | 'adset' | 'ad';

export const PINNED_LEFT_KEYS = ['_expand', 'name'];
export const PINNED_RIGHT_KEYS = ['actions'];

export const DEFAULT_COLUMN_ORDERS: Record<TableLevel, string[]> = {
  campaign: [
    'status',
    'budget',
    'utmOrders',
    'purchases',
    'spend',
    'cpm',
    'uniqueClicks',
    'costPerAddToCart',
    'costPerInitiateCheckout',
    'costPerPurchase',
    'id',
  ],
  adset: [
    'status',
    'budget',
    'spend',
    'cpm',
    'uniqueClicks',
    'utmOrders',
    'purchases',
    'costPerPurchase',
    'costPerAddToCart',
    'costPerInitiateCheckout',
    'id',
  ],
  ad: [
    'creative',
    'utmCampaign',
    'status',
    'spend',
    'cpm',
    'uniqueClicks',
    'utmOrders',
    'purchases',
    'costPerPurchase',
    'costPerAddToCart',
    'costPerInitiateCheckout',
    'id',
  ],
};

export const COLUMN_LABELS: Record<TableLevel, Record<string, string>> = {
  campaign: {
    status: '投放状态',
    budget: '预算',
    utmOrders: '成效',
    purchases: '单次成效花费',
    spend: '已花费金额',
    cpm: 'CPM',
    uniqueClicks: '单次连接点击花费',
    costPerAddToCart: '单次加购费用',
    costPerInitiateCheckout: '单次结账费用',
    costPerPurchase: 'ROAS',
    id: '广告编号',
  },
  adset: {
    status: '投放状态',
    budget: '日预算',
    spend: '已花费',
    cpm: 'CPM',
    uniqueClicks: '单次连接点击花费',
    utmOrders: '成效',
    purchases: '单次成效花费',
    costPerPurchase: 'ROAS',
    costPerAddToCart: '单次加购费用',
    costPerInitiateCheckout: '单次结账费用',
    id: '广告组编号',
  },
  ad: {
    creative: '创意',
    utmCampaign: '活动关键词',
    status: '投放状态',
    spend: '已花费',
    cpm: 'CPM',
    uniqueClicks: '单次连接点击花费',
    utmOrders: '成效',
    purchases: '单次成效花费',
    costPerPurchase: 'ROAS',
    costPerAddToCart: '单次加购费用',
    costPerInitiateCheckout: '单次结账费用',
    id: '广告编号',
  },
};

export const TABLE_LEVEL_LABELS: Record<TableLevel, string> = {
  campaign: '广告系列',
  adset: '广告组',
  ad: '广告',
};

function columnKey(col: { key?: Key; dataIndex?: unknown }): string {
  return String(col.key ?? col.dataIndex ?? '');
}

function getColumnKey(col: { key?: Key; dataIndex?: unknown }): string {
  return columnKey(col);
}

export function mergeColumnOrder(level: TableLevel, saved?: string[]): string[] {
  const defaults = DEFAULT_COLUMN_ORDERS[level];
  if (!saved?.length) return [...defaults];

  const merged: string[] = [];
  for (const key of saved) {
    if (defaults.includes(key) && !merged.includes(key)) merged.push(key);
  }
  for (const key of defaults) {
    if (!merged.includes(key)) merged.push(key);
  }
  return merged;
}

export function applyColumnOrder<T>(
  columns: ColumnsType<T>,
  savedOrder: string[],
): ColumnsType<T> {
  const left = columns.filter((c) => PINNED_LEFT_KEYS.includes(getColumnKey(c as { key?: Key; dataIndex?: unknown })));
  const right = columns.filter((c) => PINNED_RIGHT_KEYS.includes(getColumnKey(c as { key?: Key; dataIndex?: unknown })));
  const middle = columns.filter(
    (c) =>
      !PINNED_LEFT_KEYS.includes(getColumnKey(c as { key?: Key; dataIndex?: unknown }))
      && !PINNED_RIGHT_KEYS.includes(getColumnKey(c as { key?: Key; dataIndex?: unknown })),
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

  return [...left, ...sortedMiddle, ...right];
}
