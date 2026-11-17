import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({ getRedisValue: vi.fn(), setRedisValue: vi.fn() }));
const db = vi.hoisted(() => ({ queryRaw: vi.fn(), groupBy: vi.fn(), rentalCount: vi.fn() }));

vi.mock('./redis.server.js', () => redis);
vi.mock('../utils/db.server.js', () => ({
  default: {
    $queryRaw: db.queryRaw,
    property: { groupBy: db.groupBy },
    rentalUnit: { count: db.rentalCount },
  },
}));

import { getBuyCounts, getListingTotals, getRentalCounts, refreshAreaCounts } from './areaCounts.server.js';

const RENTAL_KEY = 'area-counts:rental';
const TOTALS_KEY = 'area-counts:totals';
const TTL = 7 * 24 * 60 * 60;

const rentalRows = [
  { region: '13', province: '13101', count: 5n },
  { region: '13', province: '13102', count: 2n },
  { region: '27', province: '27001', count: 9n },
];
const expectedRental = { '13': { '13101': 5, '13102': 2 }, '27': { '27001': 9 } };

const buyRows = [
  { region: '13', province: '13101', _count: 30 },
  { region: '27', province: '27001', _count: 10 },
];
const expectedBuy = { '13': { '13101': 30 }, '27': { '27001': 10 } };

const typeRows = [
  { section_type: '021', _count: 40 },
  { section_type: '010', _count: 7 },
  { section_type: null, _count: 3 },
];
const expectedTotals = { countsByType: { '021': 40, '010': 7 }, rentalCount: 265 };

describe('area counts cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.queryRaw.mockResolvedValue(rentalRows);
    db.groupBy.mockResolvedValue(typeRows);
    db.rentalCount.mockResolvedValue(265);
    redis.setRedisValue.mockResolvedValue(undefined);
  });

  describe('rental counts', () => {
    it('computes and stores the counts on a miss', async () => {
      redis.getRedisValue.mockResolvedValue(null);

      expect(await getRentalCounts()).toEqual(expectedRental);
      expect(db.queryRaw).toHaveBeenCalledTimes(1);
      expect(redis.setRedisValue).toHaveBeenCalledWith(RENTAL_KEY, JSON.stringify(expectedRental), TTL);
    });

    it('serves a hit without querying the database', async () => {
      redis.getRedisValue.mockResolvedValue(JSON.stringify(expectedRental));

      expect(await getRentalCounts()).toEqual(expectedRental);
      expect(db.queryRaw).not.toHaveBeenCalled();
      expect(redis.setRedisValue).not.toHaveBeenCalled();
    });

    it('computes without storing when Redis cannot be read', async () => {
      redis.getRedisValue.mockRejectedValue(new Error('redis down'));

      expect(await getRentalCounts()).toEqual(expectedRental);
      expect(db.queryRaw).toHaveBeenCalledTimes(1);
      expect(redis.setRedisValue).not.toHaveBeenCalled();
    });

    it('returns the counts when Redis cannot be written', async () => {
      redis.getRedisValue.mockResolvedValue(null);
      redis.setRedisValue.mockRejectedValue(new Error('redis down'));

      expect(await getRentalCounts()).toEqual(expectedRental);
    });
  });

  describe('buy counts', () => {
    it('computes one type on a miss and stores it under that type', async () => {
      redis.getRedisValue.mockResolvedValue(null);
      db.groupBy.mockResolvedValue(buyRows);

      expect(await getBuyCounts('021')).toEqual(expectedBuy);
      expect(db.groupBy).toHaveBeenCalledWith({ by: ['region', 'province'], where: { section_type: '021' }, _count: true });
      expect(redis.setRedisValue).toHaveBeenCalledWith('area-counts:buy:021', JSON.stringify(expectedBuy), TTL);
    });

    it('serves a hit without querying the database', async () => {
      redis.getRedisValue.mockResolvedValue(JSON.stringify(expectedBuy));

      expect(await getBuyCounts('021')).toEqual(expectedBuy);
      expect(db.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('listing totals', () => {
    it('computes per-type and rental totals on a miss, leaving out untyped listings', async () => {
      redis.getRedisValue.mockResolvedValue(null);

      expect(await getListingTotals()).toEqual(expectedTotals);
      expect(db.groupBy).toHaveBeenCalledTimes(1);
      expect(db.rentalCount).toHaveBeenCalledTimes(1);
      expect(redis.setRedisValue).toHaveBeenCalledWith(TOTALS_KEY, JSON.stringify(expectedTotals), TTL);
    });

    it('serves a hit without querying the database', async () => {
      redis.getRedisValue.mockResolvedValue(JSON.stringify(expectedTotals));

      expect(await getListingTotals()).toEqual(expectedTotals);
      expect(db.groupBy).not.toHaveBeenCalled();
      expect(db.rentalCount).not.toHaveBeenCalled();
    });
  });

  describe('refreshAreaCounts', () => {
    it('recomputes and overwrites both caches even when values exist', async () => {
      redis.getRedisValue.mockResolvedValue(JSON.stringify({ stale: true }));

      await refreshAreaCounts();

      expect(db.queryRaw).toHaveBeenCalledTimes(1);
      // One groupBy for the totals, plus one per purchase type (everything but the rental type).
      expect(db.groupBy).toHaveBeenCalledTimes(1 + 5);
      for (const typeId of ['010', '011', '020', '021', '030']) {
        expect(redis.setRedisValue).toHaveBeenCalledWith(`area-counts:buy:${typeId}`, expect.any(String), TTL);
      }
      expect(redis.setRedisValue).not.toHaveBeenCalledWith('area-counts:buy:040', expect.any(String), TTL);
      expect(redis.setRedisValue).toHaveBeenCalledWith(RENTAL_KEY, JSON.stringify(expectedRental), TTL);
      expect(redis.setRedisValue).toHaveBeenCalledWith(TOTALS_KEY, JSON.stringify(expectedTotals), TTL);
    });

    it('rejects when Redis cannot be written, so the worker logs the failure', async () => {
      redis.setRedisValue.mockRejectedValue(new Error('redis down'));

      await expect(refreshAreaCounts()).rejects.toThrow('redis down');
    });
  });
});
