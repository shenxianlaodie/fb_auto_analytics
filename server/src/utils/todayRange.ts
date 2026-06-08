/** 统一使用业务时区（默认 UTC+8）的「今天」作为查询/同步日期区间 */
const TZ_OFFSET_HOURS = parseInt(process.env.APP_TIMEZONE_OFFSET || '8', 10);

export function todayDateString(offsetHours: number = TZ_OFFSET_HOURS): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const local = new Date(utcMs + offsetHours * 3_600_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayDateRange(): { dateStart: string; dateEnd: string } {
  const today = todayDateString();
  return { dateStart: today, dateEnd: today };
}
