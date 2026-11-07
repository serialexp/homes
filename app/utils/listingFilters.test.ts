import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  hasActiveFilters,
  listingOrderBy,
  listingWhere,
  parseListingFilters,
} from "./listingFilters.js";

const scope = { section_type: "011", region: "030", province: "13" };

describe("parseListingFilters", () => {
  it("uses defaults when no parameters are given", () => {
    expect(parseListingFilters(new URLSearchParams(""))).toEqual(DEFAULT_FILTERS);
  });

  it("falls back to defaults for unknown values", () => {
    const params = new URLSearchParams("sort=bogus&price=1000&size=99&walk=-5");
    expect(parseListingFilters(params)).toEqual(DEFAULT_FILTERS);
  });

  it("reads known values", () => {
    const params = new URLSearchParams("sort=price_desc&price=30to60&size=60&walk=10");
    expect(parseListingFilters(params)).toEqual({ sort: "price_desc", price: "30to60", size: "60", walk: "10" });
  });
});

describe("hasActiveFilters", () => {
  it("is false for defaults and for sort alone, true when a filter is set", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: "price_desc" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, walk: "5" })).toBe(true);
  });
});

describe("listingWhere", () => {
  it("scopes to the section, area and province with no filter clauses by default", () => {
    expect(listingWhere(scope, DEFAULT_FILTERS)).toEqual({ ...scope, AND: [] });
  });

  it("builds a closed price band from the yen bounds", () => {
    const where = listingWhere(scope, { ...DEFAULT_FILTERS, price: "30to60" });
    expect(where.AND).toEqual([{ price: { gte: 30_000_000, lt: 60_000_000 } }]);
  });

  it("builds an open-ended price band when only one bound is given", () => {
    const where = listingWhere(scope, { ...DEFAULT_FILTERS, price: "over100" });
    expect(where.AND).toEqual([{ price: { gte: 100_000_000 } }]);
  });

  it("matches floor area on building area, falling back to land area when it is zero", () => {
    const where = listingWhere(scope, { ...DEFAULT_FILTERS, size: "60" });
    expect(where.AND).toEqual([
      {
        OR: [
          { building_area: { gte: 60 } },
          { building_area: { equals: 0 }, area: { gte: 60 } },
        ],
      },
    ]);
  });

  it("limits walking time and excludes unknown (zero) walk times", () => {
    const where = listingWhere(scope, { ...DEFAULT_FILTERS, walk: "10" });
    expect(where.AND).toEqual([{ walking_minutes: { gt: 0, lte: 10 } }]);
  });

  it("combines every active filter", () => {
    const where = listingWhere(scope, { sort: "price_asc", price: "under30", size: "40", walk: "15" });
    expect(where.AND).toHaveLength(3);
  });
});

describe("listingOrderBy", () => {
  it("sorts by price in the chosen direction with id as the tie-breaker", () => {
    expect(listingOrderBy({ ...DEFAULT_FILTERS, sort: "price_asc" })).toEqual([{ price: "asc" }, { id: "asc" }]);
    expect(listingOrderBy({ ...DEFAULT_FILTERS, sort: "price_desc" })).toEqual([{ price: "desc" }, { id: "asc" }]);
  });
});
