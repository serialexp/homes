import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REQUEST_INTERVAL_MS,
  createRequestPacer,
  parseRetryAfterMs,
  requestIntervalFromEnv,
  retryDelayMs,
} from './suumoRequestPolicy.js';

describe('createRequestPacer', () => {
  it('lets the first request through without waiting', async () => {
    const sleeps: number[] = [];
    const pace = createRequestPacer(3000, async ms => { sleeps.push(ms); }, () => 10_000);
    await pace();
    expect(sleeps).toEqual([]);
  });

  it('queues requests made at the same moment one interval apart', async () => {
    const sleeps: number[] = [];
    const pace = createRequestPacer(3000, async ms => { sleeps.push(ms); }, () => 10_000);
    await Promise.all([pace(), pace(), pace()]);
    expect(sleeps).toEqual([3000, 6000]);
  });

  it('waits only the remainder of the interval when time has already passed', async () => {
    let clock = 10_000;
    const sleeps: number[] = [];
    const pace = createRequestPacer(3000, async ms => { sleeps.push(ms); clock += ms; }, () => clock);
    await pace();
    clock += 1000;
    await pace();
    expect(sleeps).toEqual([2000]);
  });

  it('does not wait when the previous request was long enough ago', async () => {
    let clock = 10_000;
    const sleeps: number[] = [];
    const pace = createRequestPacer(3000, async ms => { sleeps.push(ms); }, () => clock);
    await pace();
    clock += 5000;
    await pace();
    expect(sleeps).toEqual([]);
  });
});

describe('parseRetryAfterMs', () => {
  it('reads seconds', () => {
    expect(parseRetryAfterMs('120')).toBe(120_000);
  });

  it('ignores a missing or HTTP-date header', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined();
  });

  it('caps very long waits', () => {
    expect(parseRetryAfterMs('999999')).toBe(10 * 60_000);
  });
});

describe('retryDelayMs', () => {
  it('backs off exponentially from 30 seconds', () => {
    expect(retryDelayMs(1, undefined)).toBe(30_000);
    expect(retryDelayMs(2, undefined)).toBe(60_000);
    expect(retryDelayMs(3, undefined)).toBe(120_000);
  });

  it('prefers the server-supplied delay', () => {
    expect(retryDelayMs(1, 45_000)).toBe(45_000);
  });

  it('never exceeds ten minutes', () => {
    expect(retryDelayMs(10, undefined)).toBe(10 * 60_000);
  });
});

describe('requestIntervalFromEnv', () => {
  it('uses the default when unset', () => {
    expect(requestIntervalFromEnv(undefined)).toBe(DEFAULT_REQUEST_INTERVAL_MS);
    expect(requestIntervalFromEnv('')).toBe(DEFAULT_REQUEST_INTERVAL_MS);
  });

  it('accepts a non-negative number of milliseconds', () => {
    expect(requestIntervalFromEnv('5000')).toBe(5000);
    expect(requestIntervalFromEnv('0')).toBe(0);
  });

  it('rejects values that are not a non-negative number', () => {
    expect(() => requestIntervalFromEnv('fast')).toThrow(/RETRIEVAL_REQUEST_INTERVAL_MS/);
    expect(() => requestIntervalFromEnv('-1')).toThrow(/RETRIEVAL_REQUEST_INTERVAL_MS/);
  });
});
