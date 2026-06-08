/** 与后端一致：业务时区（UTC+8）的「今天」 */
const TZ_OFFSET_HOURS = 8;

export function todayDateString(): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const local = new Date(utcMs + TZ_OFFSET_HOURS * 3_600_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayDateRange(): { dateStart: string; dateEnd: string } {
  const today = todayDateString();
  return { dateStart: today, dateEnd: today };
}
