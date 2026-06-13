export interface DailyBreakdownRow {
  date: string;
  spend: number;
  cpm: number;
  utmUv: number;
  utmAddToCart: number;
  utmBeginCheckout: number;
  utmOrders: number;
  utmSales: number;
  utmBounceRate: number;
}

export interface DailyBreakdownParent {
  id: string;
  dailyBreakdown?: DailyBreakdownRow[];
}

export type TableRowWithDaily<T> = T & {
  _isDailyRow?: boolean;
  _parentId?: string;
  _date?: string;
};

export function isMultiDayRange(dateStart: string, dateEnd: string): boolean {
  return dateStart !== dateEnd;
}

/** 枚举日期区间（最新在前） */
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

function emptyDailyRow(date: string): DailyBreakdownRow {
  return {
    date,
    spend: 0,
    cpm: 0,
    utmUv: 0,
    utmAddToCart: 0,
    utmBeginCheckout: 0,
    utmOrders: 0,
    utmSales: 0,
    utmBounceRate: 0,
  };
}

/** 确保父行有按日明细（API 未返回时用日期区间占位） */
export function resolveDailyBreakdown(
  row: DailyBreakdownParent,
  dateStart: string,
  dateEnd: string,
): DailyBreakdownRow[] {
  if (row.dailyBreakdown?.length) return row.dailyBreakdown;
  return enumerateDatesDesc(dateStart, dateEnd).map(emptyDailyRow);
}

/** 将父行 + 已展开的单日子行扁平化，便于与主表列对齐（FB 风格） */
export function flattenWithDailyBreakdown<T extends DailyBreakdownParent>(
  rows: T[],
  expandedKeys: string[],
  dateStart: string,
  dateEnd: string,
): TableRowWithDaily<T>[] {
  const out: TableRowWithDaily<T>[] = [];
  for (const row of rows) {
    out.push(row);
    if (!expandedKeys.includes(row.id)) continue;
    const days = resolveDailyBreakdown(row, dateStart, dateEnd);
    for (const day of days) {
      out.push({
        ...row,
        id: `${row.id}__day__${day.date}`,
        _isDailyRow: true,
        _parentId: row.id,
        _date: day.date,
        name: day.date,
        spend: day.spend,
        cpm: day.cpm,
        utmUv: day.utmUv,
        utmAddToCart: day.utmAddToCart,
        utmBeginCheckout: day.utmBeginCheckout,
        utmOrders: day.utmOrders,
        utmSales: day.utmSales,
        utmBounceRate: day.utmBounceRate,
      });
    }
  }
  return out;
}

export function rowExpandable(record: DailyBreakdownParent): boolean {
  return !!(record.dailyBreakdown && record.dailyBreakdown.length > 0);
}

export function hasDailySpend(record: DailyBreakdownRow): boolean {
  return Number(record.spend) > 0;
}
