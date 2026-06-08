/** 记录用户当前正在查看的账户/店铺，用于热路径优先同步 */

const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

interface ActiveEntry {
  accountId: string;
  shopId?: string;
  touchedAt: number;
}

const byAccount = new Map<string, ActiveEntry>();

function cleanAccountId(accountId: string): string {
  return accountId.replace('act_', '');
}

export function touchActiveSync(accountId: string, shopId?: string): void {
  const cleanId = cleanAccountId(accountId);
  byAccount.set(cleanId, {
    accountId: cleanId,
    shopId,
    touchedAt: Date.now(),
  });
}

export function isActiveAccount(accountId: string): boolean {
  const entry = byAccount.get(cleanAccountId(accountId));
  if (!entry) return false;
  return Date.now() - entry.touchedAt < ACTIVE_WINDOW_MS;
}

export function isActiveShop(shopId: string): boolean {
  const now = Date.now();
  for (const entry of byAccount.values()) {
    if (entry.shopId === shopId && now - entry.touchedAt < ACTIVE_WINDOW_MS) {
      return true;
    }
  }
  return false;
}

export function getActiveShopIds(): string[] {
  const now = Date.now();
  const ids = new Set<string>();
  for (const entry of byAccount.values()) {
    if (entry.shopId && now - entry.touchedAt < ACTIVE_WINDOW_MS) {
      ids.add(entry.shopId);
    }
  }
  return [...ids];
}

export function getActiveAccountIds(): string[] {
  const now = Date.now();
  return [...byAccount.values()]
    .filter((e) => now - e.touchedAt < ACTIVE_WINDOW_MS)
    .map((e) => e.accountId);
}
