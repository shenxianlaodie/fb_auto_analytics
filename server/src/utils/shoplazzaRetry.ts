function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 店铺停用、参数错误等不应重试 */
export function isShoplazzaNonRetryableError(err: any): boolean {
  const status = err?.response?.status;
  if (status === 400 || status === 401 || status === 403 || status === 404) return true;

  const body = err?.response?.data;
  const text = String(body?.error || body?.message || err?.message || '').toLowerCase();
  if (text.includes('not active') || text.includes('invalidparameter')) return true;

  return false;
}

/** SSL 断连、超时、5xx 等可重试 */
export function isShoplazzaNetworkError(err: any): boolean {
  if (isShoplazzaNonRetryableError(err)) return false;

  const code = err?.code;
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN', 'EPROTO'].includes(code)) {
    return true;
  }

  const msg = String(err?.message || '');
  if (
    msg.includes('SSL routines') ||
    msg.includes('socket hang up') ||
    msg.includes('Network Error') ||
    msg.includes('timeout')
  ) {
    return true;
  }

  const status = err?.response?.status;
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;

  // 无 response 通常是网络层错误
  return !err?.response;
}

export async function withShoplazzaRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxRetries = 4
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const retryable = isShoplazzaNetworkError(err);
      if (!retryable || attempt === maxRetries) throw err;

      const delay = Math.min(1000 * Math.pow(2, attempt), 15000);
      console.warn(
        `[Shoplazza] ${label} 网络错误，重试 ${attempt + 1}/${maxRetries}（${delay}ms）: ${err.message}`
      );
      await sleep(delay);
    }
  }
  throw new Error(`${label} 重试失败`);
}
