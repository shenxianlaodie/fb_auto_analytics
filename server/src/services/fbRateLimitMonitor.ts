/** 内存记录最近限流事件，供 Token 池监控页展示 */

export interface RateLimitEvent {
  accountId: string;
  type: 'account' | 'token';
  at: string;
  message?: string;
}

const MAX_EVENTS = 50;
const events: RateLimitEvent[] = [];

export function recordRateLimitEvent(
  accountId: string,
  type: 'account' | 'token',
  message?: string
): void {
  events.unshift({
    accountId: accountId.replace('act_', ''),
    type,
    at: new Date().toISOString(),
    message,
  });
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
}

export function getRecentRateLimitEvents(limit = 20): RateLimitEvent[] {
  return events.slice(0, limit);
}
