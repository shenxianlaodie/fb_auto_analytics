import { getCachedInsight, setCachedInsight } from '../models/cachedInsight';

// TTL in hours
export function getTTLHours(dateEnd: string): number {
  const today = new Date().toISOString().split('T')[0];
  const end = new Date(dateEnd);
  const now = new Date();
  const daysAgo = Math.floor((now.getTime() - end.getTime()) / (1000 * 60 * 60 * 24));
  if (dateEnd >= today) return 0.5;   // today: 30 min
  if (daysAgo <= 1) return 1;          // yesterday: 1 hour
  return 24;                            // older: 24 hours
}

function isCacheFresh(cached: { created_at: string } | null, ttlHours: number): boolean {
  if (!cached) return false;
  const age = (Date.now() - new Date(cached.created_at).getTime()) / (1000 * 60 * 60);
  return age < ttlHours;
}

export interface CacheKey {
  adAccountId: string;
  insightType: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  breakdown?: string;
}

function cacheKeyString(key: CacheKey): string {
  return `${key.adAccountId}:${key.insightType}:${key.dateRangeStart}:${key.dateRangeEnd}:${key.breakdown || ''}`;
}

const inflight = new Map<string, Promise<any>>();

export async function getWithSWR<T>(
  key: CacheKey,
  fetchFn: () => Promise<T>,
  persistFn: (data: T) => Promise<void>
): Promise<T> {
  const keyStr = cacheKeyString(key);
  const cached = await getCachedInsight(
    key.adAccountId,
    key.insightType,
    key.dateRangeStart,
    key.dateRangeEnd,
    key.breakdown || ''
  );
  const ttl = getTTLHours(key.dateRangeEnd);

  if (cached && isCacheFresh(cached, ttl)) {
    return JSON.parse(cached.data) as T;
  }

  if (cached) {
    if (!inflight.has(keyStr)) {
      const refresh = fetchFn()
        .then(async (data) => {
          await persistFn(data);
          return data;
        })
        .catch((err: any) => {
          console.warn(`[SWR] Background refresh failed for ${key.insightType}:`, err.message);
        })
        .finally(() => inflight.delete(keyStr));
      inflight.set(keyStr, refresh);
    }
    return JSON.parse(cached.data) as T;
  }

  if (inflight.has(keyStr)) {
    return inflight.get(keyStr)! as Promise<T>;
  }

  const promise = fetchFn()
    .then(async (data) => {
      await persistFn(data);
      return data;
    })
    .finally(() => inflight.delete(keyStr));

  inflight.set(keyStr, promise);
  return promise;
}

export async function persistInsight(key: CacheKey, data: unknown): Promise<void> {
  await setCachedInsight({
    adAccountId: key.adAccountId,
    insightType: key.insightType,
    dateRangeStart: key.dateRangeStart,
    dateRangeEnd: key.dateRangeEnd,
    breakdown: key.breakdown,
    jsonData: JSON.stringify(data),
  });
}
