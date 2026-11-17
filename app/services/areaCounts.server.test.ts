import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({ getRedisValue: vi.fn(), setRedisValue: vi.fn() }));
const db = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock('./redis.server.js', () => redis);
vi.mock('../utils/db.server.js', () => ({ default: { $queryRaw: db.queryRaw } }));

import { getRentalCounts, refreshRentalCounts } from './areaCounts.server.js';

const KEY = 'area-counts:rental';
const TTL = 7 * 24 * 60 * 60;

const queryRows = [
  { region: '13', province: '13101', count: 5n },
  { region: '13', province: '13102', count: 2n },
  { region: '27', province: '27001', count: 9n },
];
const expected = { '13': { '13101': 5, '13102': 2 }, '27': { '27001': 9 } };

describe('rental area counts cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.queryRaw.mockResolvedValue(queryRows);
    redis.setRedisValue.mockResolvedValue(undefined);
  });

  it('computes and stores the counts on a cache miss', async () => {
    redis.getRedisValue.mockResolvedValue(null);

    expect(await getRentalCounts()).toEqual(expected);
    expect(db.queryRaw).toHaveBeenCalledTimes(1);
    expect(redis.setRedisValue).toHaveBeenCalledWith(KEY, JSON.stringify(expected), TTL);
  });

  it('serves a cache hit without querying the database', async () => {
    redis.getRedisValue.mockResolvedValue(JSON.stringify(expected));

    expect(await getRentalCounts()).toEqual(expected);
    expect(db.queryRaw).not.toHaveBeenCalled();
    expect(redis.setRedisValue).not.toHaveBeenCalled();
  });

  it('computes directly, without storing, when Redis cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    redis.getRedisValue.mockRejectedValue(new Error('redis down'));

    expect(await getRentalCounts()).toEqual(expected);
    expect(db.queryRaw).toHaveBeenCalledTimes(1);
    expect(redis.setRedisValue).not.toHaveBeenCalled();
  });

  it('returns the counts when Redis cannot be written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    redis.getRedisValue.mockResolvedValue(null);
    redis.setRedisValue.mockRejectedValue(new Error('redis down'));

    expect(await getRentalCounts()).toEqual(expected);
  });

  it('refresh recomputes and overwrites the stored counts even when a value exists', async () => {
    redis.getRedisValue.mockResolvedValue(JSON.stringify({ '13': { '13101': 1 } }));

    expect(await refreshRentalCounts()).toEqual(expected);
    expect(db.queryRaw).toHaveBeenCalledTimes(1);
    expect(redis.setRedisValue).toHaveBeenCalledWith(KEY, JSON.stringify(expected), TTL);
  });
});
