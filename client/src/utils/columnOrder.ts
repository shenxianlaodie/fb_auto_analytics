import type { Key } from 'react';
import type { ColumnsType } from 'antd/es/table';

export type TableLevel = 'campaign' | 'adset' | 'ad';

export const PINNED_LEFT_KEYS = ['toggle', '_expand', 'name'];
export const PINNED_RIGHT_KEYS = ['actions'];

/** 默认可见列（不含 optional） */
export const DEFAULT_VISIBLE_COLUMNS: Record<TableLevel, string[]> = {
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

/** @deprecated use DEFAULT_VISIBLE_COLUMNS */
export const DEFAULT_COLUMN_ORDERS = DEFAULT_VISIBLE_COLUMNS;

/** 默认隐藏、用户可勾选显示 */
export const OPTIONAL_COLUMNS: Record<TableLevel, string[]> = {
  campaign: ['addToCartCount', 'beginCheckoutCount', 'aov', 'bounceRate'],
  adset: ['addToCartCount', 'beginCheckoutCount', 'aov', 'bounceRate'],
  ad: ['addToCartCount', 'beginCheckoutCount', 'aov', 'bounceRate'],
};

export const ALL_COLUMN_KEYS: Record<TableLevel, string[]> = {
  campaign: [...DEFAULT_VISIBLE_COLUMNS.campaign, ...OPTIONAL_COLUMNS.campaign],
  adset: [...DEFAULT_VISIBLE_COLUMNS.adset, ...OPTIONAL_COLUMNS.adset],
  ad: [...DEFAULT_VISIBLE_COLUMNS.ad, ...OPTIONAL_COLUMNS.ad],
};

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  toggle: 64,
  _expand: 40,
  name: 220,
  status: 110,
  budget: 100,
  utmOrders: 70,
  purchases: 90,
  spend: 90,
  cpm: 80,
  uniqueClicks: 100,
  costPerAddToCart: 90,
  costPerInitiateCheckout: 90,
  costPerPurchase: 90,
  id: 160,
  creative: 70,
  addToCartCount: 80,
  beginCheckoutCount: 100,
  aov: 80,
  bounceRate: 80,
  actions: 160,
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
    addToCartCount: '加购次数',
    beginCheckoutCount: '发起结账次数',
    aov: '客单价',
    bounceRate: '跳出率',
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
    addToCartCount: '加购次数',
    beginCheckoutCount: '发起结账次数',
    aov: '客单价',
    bounceRate: '跳出率',
  },
  ad: {
    creative: '创意',
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
    addToCartCount: '加购次数',
    beginCheckoutCount: '发起结账次数',
    aov: '客单价',
    bounceRate: '跳出率',
  },
};

export const TABLE_LEVEL_LABELS: Record<TableLevel, string> = {
  campaign: '广告系列',
  adset: '广告组',
  ad: '广告',
};

function getColumnKey(col: { key?: Key; dataIndex?: unknown }): string {
  return String(col.key ?? col.dataIndex ?? '');
}

export function mergeVisibleColumns(level: TableLevel, saved?: string[]): string[] {
  const defaults = DEFAULT_VISIBLE_COLUMNS[level];
  const optional = OPTIONAL_COLUMNS[level];
  const all = ALL_COLUMN_KEYS[level];
  if (!saved?.length) return [...defaults];

  const merged: string[] = [];
  for (const key of saved) {
    if (all.includes(key) && !merged.includes(key)) merged.push(key);
  }
  for (const key of defaults) {
    if (!merged.includes(key)) merged.push(key);
  }
  return merged.filter((key) => !optional.includes(key) || saved.includes(key));
}

/** @deprecated use mergeVisibleColumns */
export function mergeColumnOrder(level: TableLevel, saved?: string[]): string[] {
  return mergeVisibleColumns(level, saved);
}

function resolveWidth(key: string, widths?: Record<string, number>): number | undefined {
  const w = widths?.[key] ?? DEFAULT_COLUMN_WIDTHS[key];
  return w && w > 0 ? w : undefined;
}

function withWidth<T>(
  col: ColumnsType<T>[number],
  key: string,
  widths?: Record<string, number>,
): ColumnsType<T>[number] {
  const width = resolveWidth(key, widths);
  if (key === '_expand') return { ...col, width: 40 };
  if (width == null) return col;
  return { ...col, width };
}

export function applyColumnLayout<T>(
  columns: ColumnsType<T>,
  visibleOrder: string[],
  widths?: Record<string, number>,
): ColumnsType<T> {
  const left = PINNED_LEFT_KEYS
    .map((key) => columns.find((c) => getColumnKey(c as { key?: Key; dataIndex?: unknown }) === key))
    .filter((c): c is (typeof columns)[number] => !!c)
    .map((c) => withWidth(c, getColumnKey(c as { key?: Key; dataIndex?: unknown }), widths));

  const right = columns
    .filter((c) => PINNED_RIGHT_KEYS.includes(getColumnKey(c as { key?: Key; dataIndex?: unknown })))
    .map((c) => withWidth(c, getColumnKey(c as { key?: Key; dataIndex?: unknown }), widths));

  const middle = columns.filter(
    (c) =>
      !PINNED_LEFT_KEYS.includes(getColumnKey(c as { key?: Key; dataIndex?: unknown }))
      && !PINNED_RIGHT_KEYS.includes(getColumnKey(c as { key?: Key; dataIndex?: unknown })),
  );

  const middleByKey = new Map(middle.map((c) => [getColumnKey(c as { key?: Key; dataIndex?: unknown }), c]));
  const visibleSet = new Set(visibleOrder);

  const sortedMiddle = visibleOrder
    .map((key) => middleByKey.get(key))
    .filter((c): c is (typeof middle)[number] => !!c && visibleSet.has(getColumnKey(c as { key?: Key; dataIndex?: unknown })))
    .map((c) => withWidth(c, getColumnKey(c as { key?: Key; dataIndex?: unknown }), widths));

  return [...left, ...sortedMiddle, ...right];
}

/** @deprecated use applyColumnLayout */
export function applyColumnOrder<T>(
  columns: ColumnsType<T>,
  savedOrder: string[],
): ColumnsType<T> {
  return applyColumnLayout(columns, savedOrder);
}

export function getHiddenOptionalColumns(level: TableLevel, visibleOrder: string[]): string[] {
  return OPTIONAL_COLUMNS[level].filter((key) => !visibleOrder.includes(key));
}

export function getHiddenDefaultColumns(level: TableLevel, visibleOrder: string[]): string[] {
  const all = ALL_COLUMN_KEYS[level];
  return all.filter((key) => !visibleOrder.includes(key) && !OPTIONAL_COLUMNS[level].includes(key));
}
