import { ShoplazzaSpuTopRow } from '../services/shoplazzaClient';
import { calcAddToCartRate, calcTransformRate } from './spuMetrics';

/** 从 API 拉取的候选池大小，本地算分后再取 TOP N */
export const SPU_TOP_CANDIDATE_POOL = 100;

export const SPU_TOP_FINAL_LIMIT = 20;

export interface SpuScoreInput {
  orderCount: number;
  addCartUsers: number;
  viewUsers: number;
  productCreatedAt: string | null;
  statDate: string;
  /** 均价（总销售额÷销量），缺失时按 0 计（售价分取最低档 28 分） */
  price?: number;
}

function parseDateOnly(value: string): string | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/** 距今天数 = statDate − 创建日期（天），新品天数更小、得分更高 */
export function daysSinceCreated(productCreatedAt: string | null, statDate: string): number {
  if (!productCreatedAt) return 0;
  const created = parseDateOnly(productCreatedAt);
  if (!created || !statDate) return 0;
  const from = new Date(`${created}T00:00:00Z`).getTime();
  const to = new Date(`${statDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

/** 置信度因子：浏览量低时转化/加购率不可靠 */
export function computeConfidence(views: number): number {
  if (views <= 0) return 0;
  return Math.min(1, Math.pow(views / 40, 0.45));
}

/** 销量得分 S_sales（满分 100） */
export function computeSalesScore(sales: number): number {
  if (sales <= 0) return 0;
  return 100 * Math.pow(sales / (sales + 4.5), 0.68);
}

/** 转化率原始得分 S_conv（满分 100，应用置信度前） */
export function computeConvScoreRaw(convRate: number): number {
  if (convRate <= 0) return 0;
  const num = Math.log(1 + convRate / 0.005);
  const den = Math.log(1 + 0.18 / 0.005);
  return Math.min(100, (100 * num) / den);
}

/** 加购率原始得分 S_cart（满分 100，应用置信度前） */
export function computeCartScoreRaw(cartRate: number): number {
  if (cartRate <= 0) return 0;
  const num = Math.log(1 + cartRate / 0.028);
  const den = Math.log(1 + 0.38 / 0.028);
  return Math.min(100, (100 * num) / den);
}

/** 浏览量得分 S_views（满分 100） */
export function computeViewsScore(views: number): number {
  if (views <= 0) return 0;
  return 100 * Math.pow(views / (views + 55), 0.55);
}

/** 上架时长得分 S_time（满分 100，新品更高） */
export function computeTimeScore(days: number): number {
  if (days <= 0) return 100;
  return 100 * (1 - days / (days + 22));
}

/** 售价得分 S_price（压缩在 28-72 区间） */
export function computePriceScore(price: number): number {
  const p = Math.max(0, price);
  return 28 + 44 * Math.pow(p / (p + 20), 0.55);
}

/**
 * 服装产品综合分（0-100）：
 * Total = 0.28×S_sales + 0.25×C×S_conv + 0.18×C×S_cart + 0.13×S_views + 0.10×S_time + 0.06×S_price
 * 其中 C = min(1, (views/40)^0.45)
 */
export function computeSpuCompositeScore(input: SpuScoreInput): number {
  const sales = Math.max(0, input.orderCount);
  const views = Math.max(0, input.viewUsers);
  const addCart = Math.max(0, input.addCartUsers);
  const price = Math.max(0, input.price ?? 0);
  const cvr = calcTransformRate(sales, views);
  const cartRate = calcAddToCartRate(addCart, views);
  const days = daysSinceCreated(input.productCreatedAt, input.statDate);

  const c = computeConfidence(views);
  const sSales = computeSalesScore(sales);
  const sConv = c * computeConvScoreRaw(cvr);
  const sCart = c * computeCartScoreRaw(cartRate);
  const sViews = computeViewsScore(views);
  const sTime = computeTimeScore(days);
  const sPrice = computePriceScore(price);

  const total =
    0.28 * sSales + 0.25 * sConv + 0.18 * sCart + 0.13 * sViews + 0.1 * sTime + 0.06 * sPrice;

  return Math.round(total * 100) / 100;
}

export function rankSpuTopRows(
  rows: ShoplazzaSpuTopRow[],
  statDate: string,
  topN: number = SPU_TOP_FINAL_LIMIT
): ShoplazzaSpuTopRow[] {
  const scored = rows.map((row) => ({
    ...row,
    compositeScore: computeSpuCompositeScore({
      orderCount: row.orderCount,
      addCartUsers: row.addCartUsers,
      viewUsers: row.viewUsers,
      productCreatedAt: row.productCreatedAt,
      statDate,
      price: row.price,
    }),
  }));

  scored.sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) {
      return b.compositeScore - a.compositeScore;
    }
    if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
    return b.viewUsers - a.viewUsers;
  });

  return scored.slice(0, topN).map((row, idx) => ({
    ...row,
    rank: idx + 1,
  }));
}
