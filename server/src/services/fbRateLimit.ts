/**
 * Facebook 限流检测与账户级冷却注册表。
 *
 * Facebook 的限流分两类：
 *  - 通用/应用级限流（code 4/17/32/613、HTTP 429/403）：稍后重试可恢复
 *  - 广告账户级限流（code 17 + subcode 2446079）：立即重试无效，需冷却一段时间
 *
 * 账户级冷却用内存表记录，进程重启即清空（最坏情况：重启后多打一轮）。
 */

/** 任意可重试的限流错误（应用级/通用） */
export function isRateLimitError(err: any): boolean {
  const status = err?.response?.status;
  const code = err?.response?.data?.error?.code;
  const subcode = err?.response?.data?.error?.error_subcode;
  return (
    status === 429 ||
    status === 403 ||
    (status === 400 && code === 17) ||
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    code === 80004 ||
    subcode === 2446079
  );
}

/** 广告账户级限流——立即重试无意义，应进入冷却 */
export function isAccountRateLimit(err: any): boolean {
  const code = err?.response?.data?.error?.code;
  const subcode = err?.response?.data?.error?.error_subcode;
  return code === 17 && subcode === 2446079;
}

/** 默认账户冷却时长：10 分钟 */
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;

const cooldownUntil = new Map<string, number>();

function cleanId(accountId: string): string {
  return String(accountId).replace('act_', '');
}

/** 标记某账户进入限流冷却 */
export function markAccountCooldown(accountId: string, ms: number = DEFAULT_COOLDOWN_MS): void {
  const until = Date.now() + ms;
  cooldownUntil.set(cleanId(accountId), until);
  console.warn(
    `[FBRateLimit] account=${cleanId(accountId)} 进入限流冷却 ${Math.round(ms / 1000)}s（至 ${new Date(until).toISOString()}）`
  );
}

/** 该账户是否仍在冷却中 */
export function isAccountInCooldown(accountId: string): boolean {
  const until = cooldownUntil.get(cleanId(accountId));
  if (!until) return false;
  if (Date.now() >= until) {
    cooldownUntil.delete(cleanId(accountId));
    return false;
  }
  return true;
}

/** 剩余冷却毫秒（无冷却返回 0） */
export function getCooldownRemaining(accountId: string): number {
  const until = cooldownUntil.get(cleanId(accountId));
  if (!until) return 0;
  return Math.max(0, until - Date.now());
}
