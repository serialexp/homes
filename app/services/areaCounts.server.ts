import { getRedisValue, setRedisValue } from './redis.server.js';
import prisma from '../utils/db.server.js';

/** Listing counts per region and prefecture: region -> province -> count. */
export type CountsByProvince = Record<string, Record<string, number>>;

/**
 * Rental counts only change when a retrieval runs, and the worker refreshes this key when one finishes.
 * The expiry is a backstop for a key the worker never got to refresh, not the normal refresh path.
 */
const RENTAL_COUNTS_KEY = 'area-counts:rental';
const RENTAL_COUNTS_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Counts rental units per building region and prefecture. This is the expensive query the cache exists for. */
export async function computeRentalCounts(): Promise<CountsByProvince> {
  const rows = await prisma.$queryRaw<Array<{ region: string; province: string; count: bigint }>>`
    SELECT b.region, b.province, COUNT(ru.id) as count
    FROM rental_unit ru
    JOIN building b ON ru.building_id = b.id
    GROUP BY b.region, b.province
  `;

  const counts: CountsByProvince = {};
  for (const row of rows) {
    if (!counts[row.region]) counts[row.region] = {};
    counts[row.region][row.province] = Number(row.count);
  }
  return counts;
}

/** Recomputes the rental counts and stores them. Called by the worker when a retrieval finishes. */
export async function refreshRentalCounts(): Promise<CountsByProvince> {
  const counts = await computeRentalCounts();
  await setRedisValue(RENTAL_COUNTS_KEY, JSON.stringify(counts), RENTAL_COUNTS_TTL_SECONDS);
  return counts;
}

/**
 * The rental counts from the cache, computed and stored on a miss. If Redis cannot be read or written,
 * the counts are computed directly, so the page still renders, just more slowly.
 */
export async function getRentalCounts(): Promise<CountsByProvince> {
  try {
    const cached = await getRedisValue(RENTAL_COUNTS_KEY);
    if (cached) {
      return JSON.parse(cached) as CountsByProvince;
    }
  } catch (error) {
    console.error('Rental counts cache could not be read:', error);
    return computeRentalCounts();
  }

  const counts = await computeRentalCounts();
  try {
    await setRedisValue(RENTAL_COUNTS_KEY, JSON.stringify(counts), RENTAL_COUNTS_TTL_SECONDS);
  } catch (error) {
    console.error('Rental counts cache could not be written:', error);
  }
  return counts;
}
