import { recordRateLimitEvent } from './fbRateLimitMonitor';

/**
 * Facebook 限流检测与账户级冷却注册表。
 *
 * Facebook 的限流分两类：
 *  - 通用/应用级限流（code 4/17/32/613、HTTP 429/403）：稍后重试可恢复
 *  - 广告账户级限流（code 17/80004 + subcode 2446079）：立即重试无效，冷却账户而非 Token
 *  - 权限错误（code 200 等）：不重试，不冷却 Token
 *
 * 账户级冷却用内存表记录，进程重启即清空（最坏情况：重启后多打一轮）。
 */

/** Token 无法调用 /me（缺权限、已失效、非用户 Token）——轮换下一个 */
export function isTokenUnavailableError(err: any): boolean {
  const code = err?.response?.data?.error?.code;
  const subcode = err?.response?.data?.error?.error_subcode;
  const message = String(err?.response?.data?.error?.message || '').toLowerCase();
  return (
    (code === 100 && subcode === 33) ||
    code === 190 ||
    message.includes('an active access token must be used') ||
    message.includes('error validating access token')
  );
}

/** 权限/授权类错误——不应重试，不应冷却 Token */
export function isPermissionError(err: any): boolean {
  const code = err?.response?.data?.error?.code;
  const message = String(err?.response?.data?.error?.message || '').toLowerCase();
  return (
    code === 200 ||
    code === 10 ||
    message.includes('not grant ads_management') ||
    message.includes('not grant ads_read') ||
    message.includes('does not have permission') ||
    message.includes('permission denied')
  );
}

/** 任意可重试的限流错误（应用级/通用） */
export function isRateLimitError(err: any): boolean {
  if (isPermissionError(err)) return false;

  const status = err?.response?.status;
  const code = err?.response?.data?.error?.code;
  const subcode = err?.response?.data?.error?.error_subcode;

  // 账户级限流单独处理，不走 Token 冷却
  if (isAccountRateLimit(err)) return false;

  return (
    status === 429 ||
    (status === 400 && code === 17) ||
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    code === 80004
  );
}

/** 广告账户级限流——立即重试无意义，应冷却账户而非 Token */
export function isAccountRateLimit(err: any): boolean {
  const code = err?.response?.data?.error?.code;
  const subcode = err?.response?.data?.error?.error_subcode;
  return subcode === 2446079 && (code === 17 || code === 80004);
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
  recordRateLimitEvent(cleanId(accountId), 'account', `冷却 ${Math.round(ms / 1000)}s`);
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
