/**
 * Generic exponential-backoff retry utility.
 * No platform dependencies — safe to import anywhere.
 */

export interface RetryOptions {
  maxAttempts?: number;     // default 3
  initialDelayMs?: number;  // default 1000
  multiplier?: number;      // default 2  → delays: 1s, 2s, 4s
  shouldRetry?: (err: unknown) => boolean;
}

/**
 * Retries fn up to maxAttempts times with exponential backoff.
 * Throws the last error if all attempts fail.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 3, initialDelayMs = 1000, multiplier = 2, shouldRetry = isTransientError } = opts;

  let lastErr: unknown;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !shouldRetry(err)) throw err;
      console.warn(`[retry] attempt ${attempt}/${maxAttempts} failed — retrying in ${delayMs}ms`, (err as Error).message);
      await sleep(delayMs);
      delayMs = Math.min(delayMs * multiplier, 30_000); // cap at 30s
    }
  }

  throw lastErr;
}

/**
 * Returns true for errors that are worth retrying:
 * - Network/connection errors
 * - HTTP 429 (rate limit) and 5xx (server errors)
 * Returns false for 4xx client errors (config/auth problems won't fix themselves).
 */
export function isTransientError(err: unknown): boolean {
  if (!err) return false;

  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  // Network-level errors
  if (msg.includes('fetch failed') || msg.includes('econnreset') ||
      msg.includes('econnrefused') || msg.includes('etimedout') ||
      msg.includes('network') || msg.includes('socket')) {
    return true;
  }

  // HTTP status codes embedded in error messages (e.g. "failed (503): ...")
  const statusMatch = msg.match(/\((\d{3})\)/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    return status === 429 || (status >= 500 && status <= 599);
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
