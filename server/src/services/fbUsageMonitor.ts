/**
 * Facebook API 配额水位监控。
 *
 * 解析响应头（成功与失败响应都带）：
 *  - x-app-usage:               {"call_count":28,"total_time":25,"total_cputime":25}（百分比）
 *  - x-ad-account-usage:        {"acc_id_util_pct":9.67}
 *  - x-business-use-case-usage: {"<ad_account_id>":[{"type":"ads_management","call_count":1,
 *                                "total_cputime":1,"total_time":1,"estimated_time_to_regain_access":0}]}
 *
 * 分级策略（被动撞限流之前主动减速）：
 *  - >= SLOW_PCT  (80%)：降频——同步 TTL 加倍
 *  - >= HALT_PCT  (95%)：熔断——跳过该账户的非强制同步
 *  - estimated_time_to_regain_access > 0：按 FB 给的恢复时间熔断
 */

const SLOW_PCT = 80;
const HALT_PCT = 95;

/** 水位记录有效期：太久没有新请求时不作为决策依据 */
const USAGE_STALE_MS = 10 * 60 * 1000;

interface UsageRecord {
  pct: number;
  at: number;
  /** FB 指示的恢复时间（毫秒时间戳，0 表示无） */
  regainUntil: number;
}

const accountUsage = new Map<string, UsageRecord>();
let appUsage: UsageRecord | null = null;

const ACT_RE = /act_(\d+)/;

function maxPct(obj: Record<string, unknown>): number {
  let max = 0;
  for (const key of ['call_count', 'total_time', 'total_cputime', 'acc_id_util_pct']) {
    const v = Number((obj as any)[key]);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max;
}

function parseHeaderJson(value: unknown): any | null {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** 在每次 FB 响应（成功或失败）后调用 */
export function recordUsageHeaders(edge: string, headers: Record<string, unknown> | undefined): void {
  if (!headers) return;
  const now = Date.now();
  const edgeAccount = ACT_RE.exec(edge)?.[1];

  const app = parseHeaderJson(headers['x-app-usage']);
  if (app) {
    appUsage = { pct: maxPct(app), at: now, regainUntil: 0 };
  }

  const adAccount = parseHeaderJson(headers['x-ad-account-usage']);
  if (adAccount && edgeAccount) {
    const prev = accountUsage.get(edgeAccount);
    accountUsage.set(edgeAccount, {
      pct: maxPct(adAccount),
      at: now,
      regainUntil: prev?.regainUntil && prev.regainUntil > now ? prev.regainUntil : 0,
    });
  }

  const buc = parseHeaderJson(headers['x-business-use-case-usage']);
  if (buc && typeof buc === 'object') {
    for (const [accountId, entries] of Object.entries(buc)) {
      if (!Array.isArray(entries)) continue;
      let pct = 0;
      let regainUntil = 0;
      for (const entry of entries) {
        pct = Math.max(pct, maxPct(entry));
        const regainMin = Number(entry?.estimated_time_to_regain_access);
        if (Number.isFinite(regainMin) && regainMin > 0) {
          regainUntil = Math.max(regainUntil, now + regainMin * 60 * 1000);
        }
      }
      const existing = accountUsage.get(accountId);
      accountUsage.set(accountId, {
        pct: Math.max(pct, existing && now - existing.at < 5000 ? existing.pct : 0),
        at: now,
        regainUntil: Math.max(regainUntil, existing?.regainUntil || 0),
      });
      if (regainUntil > now) {
        console.warn(
          `[FBUsage] account=${accountId} BUC 限流，FB 指示恢复时间 ${new Date(regainUntil).toISOString()}`
        );
      }
    }
  }
}

function freshRecord(rec: UsageRecord | null | undefined): UsageRecord | null {
  if (!rec) return null;
  if (Date.now() - rec.at > USAGE_STALE_MS && rec.regainUntil < Date.now()) return null;
  return rec;
}

export function getAccountUsagePct(accountId: string): number {
  const rec = freshRecord(accountUsage.get(String(accountId).replace('act_', '')));
  return rec?.pct ?? 0;
}

export function getAppUsagePct(): number {
  return freshRecord(appUsage)?.pct ?? 0;
}

export type ThrottleState = 'ok' | 'slow' | 'halt';

/** 综合账户级 + 应用级水位的分级决策 */
export function getUsageThrottleState(accountId: string): ThrottleState {
  const cleanId = String(accountId).replace('act_', '');
  const rec = freshRecord(accountUsage.get(cleanId));
  const now = Date.now();

  if (rec && rec.regainUntil > now) return 'halt';

  const pct = Math.max(rec?.pct ?? 0, getAppUsagePct());
  if (pct >= HALT_PCT) return 'halt';
  if (pct >= SLOW_PCT) return 'slow';
  return 'ok';
}

/** 管理后台/调试用快照 */
export function getUsageSnapshot(): {
  app: { pct: number } | null;
  accounts: Array<{ accountId: string; pct: number; regainUntil: number | null }>;
} {
  const now = Date.now();
  const accounts: Array<{ accountId: string; pct: number; regainUntil: number | null }> = [];
  for (const [accountId, rec] of accountUsage) {
    if (!freshRecord(rec)) continue;
    accounts.push({
      accountId,
      pct: rec.pct,
      regainUntil: rec.regainUntil > now ? rec.regainUntil : null,
    });
  }
  accounts.sort((a, b) => b.pct - a.pct);
  return { app: appUsage ? { pct: appUsage.pct } : null, accounts };
}
