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

/**
 * 通用版综合分（推荐日常使用）：
 * Score = 1.5×ln(销量+1) + 0.5×ln(浏览+1) + 2.0×转化率 + 0.3×加购率 − 0.02×距今天数
 */
export function computeSpuCompositeScore(input: SpuScoreInput): number {
  const sales = Math.max(0, input.orderCount);
  const views = Math.max(0, input.viewUsers);
  const addCart = Math.max(0, input.addCartUsers);
  const cvr = calcTransformRate(sales, views);
  const cartRate = calcAddToCartRate(addCart, views);
  const days = daysSinceCreated(input.productCreatedAt, input.statDate);

  const score =
    1.5 * Math.log(sales + 1) +
    0.5 * Math.log(views + 1) +
    2.0 * cvr +
    0.3 * cartRate -
    0.02 * days;

  return Math.round(score * 10000) / 10000;
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
