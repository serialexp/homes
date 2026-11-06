/**
 * Pacing and retry rules for requests to suumo.jp. Kept free of I/O so the rules can be tested
 * without the network or real timers.
 */

export const DEFAULT_REQUEST_INTERVAL_MS = 500;
export const MAX_FETCH_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 10 * 60_000;

/** HTTP statuses that mean "try again later", as opposed to a page that doesn't exist or a bad request */
export const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Minimum gap between request starts, read from RETRIEVAL_REQUEST_INTERVAL_MS */
export function requestIntervalFromEnv(value: string | undefined): number {
  if (value === undefined || value === '') {
    return DEFAULT_REQUEST_INTERVAL_MS;
  }
  const interval = Number(value);
  if (!Number.isFinite(interval) || interval < 0) {
    throw new Error(`RETRIEVAL_REQUEST_INTERVAL_MS must be a non-negative number of milliseconds, got "${value}"`);
  }
  return interval;
}

/**
 * Returns a function that resolves once at least `intervalMs` has passed since the previous
 * request started. Each call reserves its slot synchronously, so concurrent callers queue up.
 */
export function createRequestPacer(
  intervalMs: number,
  sleep: (ms: number) => Promise<void>,
  now: () => number = Date.now
): () => Promise<void> {
  let nextSlotAt = 0;
  return async () => {
    const slotAt = Math.max(now(), nextSlotAt);
    nextSlotAt = slotAt + intervalMs;
    const wait = slotAt - now();
    if (wait > 0) {
      await sleep(wait);
    }
  };
}

/** Parses a Retry-After header given in seconds. HTTP-date values are ignored. */
export function parseRetryAfterMs(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header.trim())) {
    return undefined;
  }
  return Math.min(Number(header.trim()) * 1000, MAX_RETRY_DELAY_MS);
}

/** Delay before retry number `attempt` (1-based): Retry-After if the server sent one, else exponential backoff */
export function retryDelayMs(attempt: number, retryAfterMs: number | undefined): number {
  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
}
