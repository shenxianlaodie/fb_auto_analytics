/** 广告 ID 与 utm_content 精确匹配 */
export function adIdMatchesUtmContent(adId: string, utmValue: string): boolean {
  const a = adId.trim();
  const u = utmValue.trim();
  if (!a || !u) return false;
  return a === u;
}

export function calcAov(sales: number, orders: number): number {
  if (!orders || orders <= 0) return 0;
  return Math.round((sales / orders) * 100) / 100;
}
