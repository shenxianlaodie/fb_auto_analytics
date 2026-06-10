import { isAccountRateLimit, isRateLimitError } from './fbRateLimit';
import { sleep } from '../utils/sleep';
import { onAppRateLimitError } from './tokenPool';

interface QueueTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

interface QueueOptions {
  maxConcurrent: number;
  minIntervalMs: number;
  label: string;
}

class FBRequestQueue {
  private static webInstance: FBRequestQueue;
  private static syncInstance: FBRequestQueue;
  private queue: QueueTask<any>[] = [];
  private active = 0;
  private lastRequestAt = 0;

  constructor(private readonly opts: QueueOptions) {}

  static getWebQueue(): FBRequestQueue {
    if (!FBRequestQueue.webInstance) {
      FBRequestQueue.webInstance = new FBRequestQueue({
        label: 'web',
        maxConcurrent: 2,
        minIntervalMs: 500,
      });
    }
    return FBRequestQueue.webInstance;
  }

  static getSyncQueue(): FBRequestQueue {
    if (!FBRequestQueue.syncInstance) {
      FBRequestQueue.syncInstance = new FBRequestQueue({
        label: 'sync',
        maxConcurrent: 1,
        minIntervalMs: 800,
      });
    }
    return FBRequestQueue.syncInstance;
  }

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.active >= this.opts.maxConcurrent || this.queue.length === 0) return;

    const task = this.queue.shift()!;
    this.active++;

    (async () => {
      try {
        const now = Date.now();
        const wait = this.opts.minIntervalMs - (now - this.lastRequestAt);
        if (wait > 0) await sleep(wait);

        const result = await this.executeWithRetry(task.fn);
        this.lastRequestAt = Date.now();
        task.resolve(result);
      } catch (err) {
        task.reject(err);
      } finally {
        this.active--;
        this.processQueue();
      }
    })();
  }

  private async executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
    let tokenCooled = false;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (isAccountRateLimit(err) || !isRateLimitError(err) || attempt === maxRetries) throw err;
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        console.warn(
          `[FB Queue:${this.opts.label}] Rate limited, retry ${attempt + 1}/${maxRetries} in ${delay}ms`
        );
        // 每次请求最多冷却一个 Token，避免重试链误伤多个 Token
        if (!tokenCooled) {
          await onAppRateLimitError(this.opts.label === 'sync');
          tokenCooled = true;
        }
        await sleep(delay);
      }
    }
    throw new Error('FB request failed after retries');
  }
}

/** Web 进程实时查询队列 */
export const fbQueue = FBRequestQueue.getWebQueue();

/** Sync 进程后台同步队列（更低并发） */
export const fbSyncQueue = FBRequestQueue.getSyncQueue();

/** 根据进程类型选择队列 */
export function getFbQueue(): FBRequestQueue {
  return process.env.SYNC_WORKER === '1' ? fbSyncQueue : fbQueue;
}
