import { getRedisValue, setRedisValue } from './redis.server.js';
import prisma from '../utils/db.server.js';
import { propertyTypes } from '../data/propertyData.js';

/** Listing counts per region and prefecture: region -> province -> count. */
export type CountsByProvince = Record<string, Record<string, number>>;

/** The front-page totals: purchase listings per property type, and rental units overall. */
export interface ListingTotals {
  countsByType: Record<string, number>;
  rentalCount: number;
}

/**
 * These counts only change when a retrieval runs, and the worker refreshes every key here when one finishes.
 * The expiry is a backstop for a key the worker never got to refresh, not the normal refresh path.
 */
const RENTAL_COUNTS_KEY = 'area-counts:rental';
const LISTING_TOTALS_KEY = 'area-counts:totals';
const RENTAL_TYPE_ID = '040';
const buyCountsKey = (typeId: string) => `area-counts:buy:${typeId}`;

/** The purchase property types: every type except the rental one. */
const BUY_TYPE_IDS = Object.keys(propertyTypes).filter((id) => id !== RENTAL_TYPE_ID);
const COUNTS_TTL_SECONDS = 7 * 24 * 60 * 60;

async function computeRentalCounts(): Promise<CountsByProvince> {
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

async function computeBuyCounts(typeId: string): Promise<CountsByProvince> {
  const rows = await prisma.property.groupBy({
    by: ['region', 'province'],
    where: { section_type: typeId },
    _count: true,
  });

  const counts: CountsByProvince = {};
  for (const row of rows) {
    if (!counts[row.region]) counts[row.region] = {};
    counts[row.region][row.province] = row._count;
  }
  return counts;
}

async function computeListingTotals(): Promise<ListingTotals> {
  const [perType, rentalCount] = await Promise.all([
    prisma.property.groupBy({ by: ['section_type'], _count: true }),
    prisma.rentalUnit.count(),
  ]);

  const countsByType: Record<string, number> = {};
  for (const row of perType) {
    if (row.section_type) countsByType[row.section_type] = row._count;
  }
  return { countsByType, rentalCount };
}

/**
 * Read-through cache. A miss computes and stores the value. If Redis cannot be read, the value is computed
 * directly and not stored, so the page still renders, just more slowly. If Redis cannot be written, the value is
 * returned anyway.
 */
async function readThrough<T>(key: string, compute: () => Promise<T>): Promise<T> {
  let cached: string | null;
  try {
    cached = await getRedisValue(key);
  } catch (error) {
    console.error(`Cache ${key} could not be read:`, error);
    return compute();
  }
  if (cached) {
    return JSON.parse(cached) as T;
  }

  const value = await compute();
  try {
    await setRedisValue(key, JSON.stringify(value), COUNTS_TTL_SECONDS);
  } catch (error) {
    console.error(`Cache ${key} could not be written:`, error);
  }
  return value;
}

/** Recomputes a value and overwrites what is stored. Called by the worker when a retrieval finishes. */
async function refresh<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const value = await compute();
  await setRedisValue(key, JSON.stringify(value), COUNTS_TTL_SECONDS);
  return value;
}

export function getRentalCounts(): Promise<CountsByProvince> {
  return readThrough(RENTAL_COUNTS_KEY, computeRentalCounts);
}

/** Purchase listing counts per prefecture for one property type. */
export function getBuyCounts(typeId: string): Promise<CountsByProvince> {
  return readThrough(buyCountsKey(typeId), () => computeBuyCounts(typeId));
}

export function getListingTotals(): Promise<ListingTotals> {
  return readThrough(LISTING_TOTALS_KEY, computeListingTotals);
}

/** Refreshes every cached count. Called by the worker after each retrieval job, success or failure. */
export async function refreshAreaCounts(): Promise<void> {
  await Promise.all([
    refresh(RENTAL_COUNTS_KEY, computeRentalCounts),
    refresh(LISTING_TOTALS_KEY, computeListingTotals),
    ...BUY_TYPE_IDS.map((typeId) => refresh(buyCountsKey(typeId), () => computeBuyCounts(typeId))),
  ]);
}
