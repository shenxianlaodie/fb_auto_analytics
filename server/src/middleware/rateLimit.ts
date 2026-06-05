import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Facebook Marketing API rate limits:
// Standard: ~200 calls/hour per user per app
// We set a conservative limit: 100 requests per 10 minutes per user
const MAX_REQUESTS = 100;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || 'unknown';
  const now = Date.now();

  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, entry);
  }

  entry.count++;

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.floor(entry.resetAt / 1000));

  if (entry.count > MAX_REQUESTS) {
    res.status(429).json({
      error: '请求过于频繁，请稍后再试',
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    });
    return;
  }

  next();
}

// Clean up expired entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 30 * 60 * 1000);
