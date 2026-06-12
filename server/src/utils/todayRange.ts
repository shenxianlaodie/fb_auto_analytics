/** 统一使用业务时区（默认 UTC+8）的「今天」作为查询/同步日期区间 */
const TZ_OFFSET_HOURS = parseInt(process.env.APP_TIMEZONE_OFFSET || '8', 10);

/** SPU TOP 榜滚动统计天数（含首尾） */
export const SPU_TOP_RANGE_DAYS = 14;

/** SPU TOP 历史快照保留天数 */
export const SPU_TOP_RETENTION_DAYS = 30;

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

function parseDateOnly(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function formatDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 日期加减（按 UTC 日历天） */
export function addDays(dateStr: string, days: number): string {
  const dt = parseDateOnly(dateStr);
  if (!dt) return dateStr;
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatDateOnly(dt);
}

/** SPU TOP 滚动窗口：以 statDate 为结束日，向前 rangeDays-1 天为起始日 */
export function spuTopDateRange(
  statDate: string,
  rangeDays: number = SPU_TOP_RANGE_DAYS
): { dateStart: string; dateEnd: string } {
  const dateEnd = statDate;
  const dateStart = addDays(statDate, -(rangeDays - 1));
  return { dateStart, dateEnd };
}

/** 计算保留 cutoff：删除 stat_date 早于此日期的记录 */
export function spuTopRetentionCutoff(
  anchorDate: string,
  retentionDays: number = SPU_TOP_RETENTION_DAYS
): string {
  return addDays(anchorDate, -(retentionDays - 1));
}
