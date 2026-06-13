/** 枚举日期区间内的每一天（含起止），倒序（最新在前，与 FB 广告管理一致） */
export function enumerateDatesDesc(dateStart: string, dateEnd: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = dateStart.split('-').map(Number);
  const [ey, em, ed] = dateEnd.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates.reverse();
}
