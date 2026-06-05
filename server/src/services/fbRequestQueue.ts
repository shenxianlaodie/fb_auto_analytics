function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface QueueTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function isRateLimitError(err: any): boolean {
  const status = err?.response?.status;
  const code = err?.response?.data?.error?.code;
  const subcode = err?.response?.data?.error?.error_subcode;
  return (
    status === 429 ||
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    code === 80004 ||
    subcode === 2446079
  );
}

class FBRequestQueue {
  private static instance: FBRequestQueue;
  private queue: QueueTask<any>[] = [];
  private active = 0;
  private readonly maxConcurrent = 2;
  private readonly minIntervalMs = 500;
  private lastRequestAt = 0;

  static getInstance(): FBRequestQueue {
    if (!FBRequestQueue.instance) {
      FBRequestQueue.instance = new FBRequestQueue();
    }
    return FBRequestQueue.instance;
  }

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) return;

    const task = this.queue.shift()!;
    this.active++;

    (async () => {
      try {
        const now = Date.now();
        const wait = this.minIntervalMs - (now - this.lastRequestAt);
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
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (!isRateLimitError(err) || attempt === maxRetries) throw err;
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        console.warn(`[FB Queue] Rate limited, retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await sleep(delay);
      }
    }
    throw new Error('FB request failed after retries');
  }
}

export const fbQueue = FBRequestQueue.getInstance();
