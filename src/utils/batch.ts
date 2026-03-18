type RetryableError = {
  status?: number;
  code?: string;
  message?: string;
};

type ConcurrencyTask<TItem, TResult> = (item: TItem, index: number) => Promise<TResult>;

export type RunConcurrentOptions = {
  concurrency?: number;
  retry?: number;
  retryDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504, 524]);
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ERR_NETWORK',
  'ERR_BAD_RESPONSE'
]);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

export const isRetryableRequestError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as RetryableError;

  if (typeof maybeError.status === 'number' && RETRYABLE_STATUS_CODES.has(maybeError.status)) {
    return true;
  }

  if (typeof maybeError.code === 'string' && RETRYABLE_ERROR_CODES.has(maybeError.code)) {
    return true;
  }

  if (typeof maybeError.message === 'string') {
    const message = maybeError.message.toLowerCase();
    if (message.includes('timeout') || message.includes('network')) {
      return true;
    }
  }

  return false;
};

export const runTasksWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  task: ConcurrencyTask<TItem, TResult>,
  options?: RunConcurrentOptions
): Promise<PromiseSettledResult<TResult>[]> => {
  if (items.length === 0) return [];

  const concurrency = Math.max(1, Math.floor(options?.concurrency ?? 1));
  const maxRetry = Math.max(0, Math.floor(options?.retry ?? 0));
  const retryDelayMs = Math.max(0, Math.floor(options?.retryDelayMs ?? 0));
  const shouldRetry = options?.shouldRetry;
  const results: PromiseSettledResult<TResult>[] = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;

      let attempt = 0;
      while (true) {
        try {
          const value = await task(items[index], index);
          results[index] = { status: 'fulfilled', value };
          break;
        } catch (error: unknown) {
          const canRetry =
            attempt < maxRetry &&
            (typeof shouldRetry === 'function' ? shouldRetry(error, attempt + 1) : false);
          if (!canRetry) {
            results[index] = { status: 'rejected', reason: error };
            break;
          }
          attempt += 1;
          if (retryDelayMs > 0) {
            await sleep(retryDelayMs * attempt);
          }
        }
      }
    }
  };

  const workerCount = Math.min(items.length, concurrency);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
};
