import type { Prisma } from "@prisma/client";

export const LISTINGS_PER_PAGE = 12;

export const SORT_KEYS = ["price_asc", "price_desc"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

// Price bands in yen. min is inclusive, max is exclusive; a missing bound is open.
const PRICE_BANDS = {
  any: {},
  under30: { max: 30_000_000 },
  "30to60": { min: 30_000_000, max: 60_000_000 },
  "60to100": { min: 60_000_000, max: 100_000_000 },
  over100: { min: 100_000_000 },
} satisfies Record<string, { min?: number; max?: number }>;
export type PriceKey = keyof typeof PRICE_BANDS;

// Floor area in m², inclusive minimum. 0 means no limit.
const SIZE_MIN = { any: 0, "40": 40, "60": 60, "80": 80 } as const;
export type SizeKey = keyof typeof SIZE_MIN;

// Minutes walking to the station, inclusive maximum. 0 means no limit.
const WALK_MAX = { any: 0, "5": 5, "10": 10, "15": 15 } as const;
export type WalkKey = keyof typeof WALK_MAX;

const PRICE_KEYS = Object.keys(PRICE_BANDS) as PriceKey[];
const SIZE_KEYS = Object.keys(SIZE_MIN) as SizeKey[];
const WALK_KEYS = Object.keys(WALK_MAX) as WalkKey[];

export interface ListingFilters {
  sort: SortKey;
  price: PriceKey;
  size: SizeKey;
  walk: WalkKey;
}

export const DEFAULT_FILTERS: ListingFilters = {
  sort: "price_asc",
  price: "any",
  size: "any",
  walk: "any",
};

export interface ListingScope {
  section_type: string;
  region: string;
  province: string;
}

function oneOf<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

// Unknown or missing values fall back to the default instead of failing the page.
export function parseListingFilters(params: URLSearchParams): ListingFilters {
  return {
    sort: oneOf(params.get("sort"), SORT_KEYS, "price_asc"),
    price: oneOf(params.get("price"), PRICE_KEYS, "any"),
    size: oneOf(params.get("size"), SIZE_KEYS, "any"),
    walk: oneOf(params.get("walk"), WALK_KEYS, "any"),
  };
}

export function hasActiveFilters(filters: ListingFilters): boolean {
  return filters.price !== "any" || filters.size !== "any" || filters.walk !== "any";
}

export function listingWhere(scope: ListingScope, filters: ListingFilters): Prisma.PropertyWhereInput {
  const clauses: Prisma.PropertyWhereInput[] = [];

  if (filters.price !== "any") {
    const band: { min?: number; max?: number } = PRICE_BANDS[filters.price];
    clauses.push({ price: { gte: band.min, lt: band.max } });
  }

  const sizeMin = SIZE_MIN[filters.size];
  if (sizeMin > 0) {
    // building_area is 0 when the listing did not give one; the card then shows the land figure.
    clauses.push({
      OR: [
        { building_area: { gte: sizeMin } },
        { building_area: { equals: 0 }, area: { gte: sizeMin } },
      ],
    });
  }

  const walkMax = WALK_MAX[filters.walk];
  if (walkMax > 0) {
    // walking_minutes of 0 means unknown, so it never matches a walk limit.
    clauses.push({ walking_minutes: { gt: 0, lte: walkMax } });
  }

  return { section_type: scope.section_type, region: scope.region, province: scope.province, AND: clauses };
}

export function listingOrderBy(filters: ListingFilters): Prisma.PropertyOrderByWithRelationInput[] {
  // id breaks ties so pages do not shuffle between requests.
  return [{ price: filters.sort === "price_desc" ? "desc" : "asc" }, { id: "asc" }];
}
