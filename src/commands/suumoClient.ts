import {
  MAX_FETCH_ATTEMPTS,
  RETRYABLE_STATUSES,
  createRequestPacer,
  parseRetryAfterMs,
  requestIntervalFromEnv,
  retryDelayMs
} from './suumoRequestPolicy.js';

const REQUEST_TIMEOUT_MS = 30_000;

/** Every Suumo request, listing pages and detail pages alike, waits its turn here. The worker is the only Suumo client, so this is one shared pace. */
const paceRequest = createRequestPacer(
  requestIntervalFromEnv(process.env.RETRIEVAL_REQUEST_INTERVAL_MS),
  ms => new Promise(resolve => setTimeout(resolve, ms))
);

/** Suumo answered, but not with a page we can use. Retrying won't help, so it is never retried. */
export class SuumoResponseError extends Error {}

const REQUEST_HEADERS = {
  'Connection': 'keep-alive',
  'Cache-Control': 'max-age=0',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Fetches one Suumo page and returns its HTML, paced and retried. Rate limits, server errors, network errors and
 * timeouts are retried with backoff. Any other HTTP error, or running out of attempts, throws SuumoResponseError,
 * so the caller fails instead of recording an incomplete result as done.
 */
export async function fetchSuumoHtml(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    await paceRequest();

    let failure = '';
    let retryAfterMs: number | undefined;
    try {
      const response = await fetch(url, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.ok) {
        return await response.text();
      }
      if (!RETRYABLE_STATUSES.has(response.status)) {
        throw new SuumoResponseError(`Suumo returned HTTP ${response.status} for ${url}`);
      }
      failure = `HTTP ${response.status}`;
      retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    } catch (error) {
      if (error instanceof SuumoResponseError) {
        throw error;
      }
      failure = error instanceof Error ? error.message : String(error);
    }

    if (attempt >= MAX_FETCH_ATTEMPTS) {
      throw new SuumoResponseError(`Giving up on ${url} after ${attempt} attempts (last failure: ${failure})`);
    }
    const delayMs = retryDelayMs(attempt, retryAfterMs);
    console.warn(`Suumo request failed (${failure}), retry ${attempt} of ${MAX_FETCH_ATTEMPTS - 1} in ${Math.round(delayMs / 1000)}s: ${url}`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}
