export const DEFAULT_SPU_TOP_COLUMN_ORDER = [
  'rank',
  'product',
  'compositeScore',
  'orderCount',
  'productCreatedAt',
  'addCartUsers',
  'viewUsers',
  'addToCartRate',
  'transformRate',
] as const;

export type SpuTopColumnKey = (typeof DEFAULT_SPU_TOP_COLUMN_ORDER)[number];

const VALID_KEYS = new Set<string>(DEFAULT_SPU_TOP_COLUMN_ORDER);

export function mergeSpuTopColumnOrder(saved?: string[]): string[] {
  const defaults = [...DEFAULT_SPU_TOP_COLUMN_ORDER];
  if (!saved?.length) return defaults;

  const merged: string[] = [];
  for (const key of saved) {
    if (VALID_KEYS.has(key) && !merged.includes(key)) merged.push(key);
  }
  for (const key of defaults) {
    if (!merged.includes(key)) merged.push(key);
  }
  return merged;
}

export function validateColumnOrder(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const keys = input.map(String).filter((k) => VALID_KEYS.has(k));
  if (keys.length === 0) return null;
  return mergeSpuTopColumnOrder(keys);
}
