/** 加购率 = 加购用户数 ÷ 浏览用户数 */
export function calcAddToCartRate(addCartUsers: number, viewUsers: number): number {
  if (viewUsers <= 0) return 0;
  return Math.round((addCartUsers / viewUsers) * 10000) / 10000;
}

/** 转化率 = 订单量 ÷ 浏览用户数（与综合分公式一致） */
export function calcTransformRate(orderCount: number, viewUsers: number): number {
  if (viewUsers <= 0) return 0;
  return Math.round((orderCount / viewUsers) * 10000) / 10000;
}
