import { query, queryOne } from './database';
import {
  DEFAULT_SPU_TOP_COLUMN_ORDER,
  mergeSpuTopColumnOrder,
} from '../utils/spuTopColumnOrder';

export interface SpuTopColumnOrderRecord {
  column_order: string[];
  updated_at: string;
  updated_by: string | null;
}

export async function getSpuTopColumnOrder(): Promise<string[]> {
  const row = await queryOne(
    `SELECT column_order FROM spu_top_column_order WHERE id = 1`
  ) as { column_order: string[] } | null;
  if (!row?.column_order) return [...DEFAULT_SPU_TOP_COLUMN_ORDER];
  return mergeSpuTopColumnOrder(row.column_order);
}

export async function getSpuTopColumnOrderMeta(): Promise<SpuTopColumnOrderRecord | null> {
  const row = await queryOne(
    `SELECT column_order, updated_at, updated_by FROM spu_top_column_order WHERE id = 1`
  ) as SpuTopColumnOrderRecord | null;
  if (!row) return null;
  return {
    column_order: mergeSpuTopColumnOrder(row.column_order),
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}

export async function saveSpuTopColumnOrder(
  columnOrder: string[],
  updatedBy?: string
): Promise<string[]> {
  const merged = mergeSpuTopColumnOrder(columnOrder);
  await query(
    `INSERT INTO spu_top_column_order (id, column_order, updated_at, updated_by)
     VALUES (1, $1::jsonb, NOW(), $2)
     ON CONFLICT (id) DO UPDATE SET
       column_order = EXCLUDED.column_order,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by`,
    [JSON.stringify(merged), updatedBy ?? null]
  );
  return merged;
}
