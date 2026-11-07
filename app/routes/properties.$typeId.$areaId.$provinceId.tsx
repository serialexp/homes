import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useSearchParams } from "@remix-run/react";
import type { Prisma } from "@prisma/client";
import { areas, propertyTypes } from "../data/propertyData.js";
import { floorAreaOf, man, photoCount, shortYen, sqm, yen } from "../utils/format.js";
import {
  LISTINGS_PER_PAGE,
  hasActiveFilters,
  listingOrderBy,
  listingWhere,
  parseListingFilters,
} from "../utils/listingFilters.js";
import prisma from "../utils/db.server.js";
import { translateAndUpdateProperties } from "../utils/translation.server.js";

type ListingRow = Prisma.PropertyGetPayload<{ include: { priceHistory: true } }>;

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { typeId, areaId, provinceId } = params;
  const url = new URL(request.url);
  const requestedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const filters = parseListingFilters(url.searchParams);

  if (!typeId || !propertyTypes[typeId]) {
    throw new Response("Invalid property type", { status: 404 });
  }
  if (!areaId || !areas[areaId]) {
    throw new Response("Invalid area", { status: 404 });
  }
  const area = areas[areaId];
  if (!provinceId || !area.provinces[provinceId]) {
    throw new Response("Invalid province", { status: 404 });
  }

  const where = listingWhere({ section_type: typeId, region: areaId, province: provinceId }, filters);

  const [countTotal, properties] = await Promise.all([
    prisma.property.count({ where }),
    prisma.property.findMany({
      where,
      orderBy: listingOrderBy(filters),
      skip: (page - 1) * LISTINGS_PER_PAGE,
      take: LISTINGS_PER_PAGE,
      // The two most recent price points, for the price-cut badge.
      include: { priceHistory: { orderBy: { recorded_at: "desc" }, take: 2 } },
    }),
  ]);

  const translatedProperties = await translateAndUpdateProperties(properties);

  return json({
    properties: translatedProperties,
    countTotal,
    currentPage: page,
    totalPages: Math.ceil(countTotal / LISTINGS_PER_PAGE),
    filters,
    selectedType: { id: typeId, name: propertyTypes[typeId] },
    selectedArea: { id: areaId, name: area.name },
    selectedProvince: { id: provinceId, name: area.provinces[provinceId] },
  });
}

const SORT_OPTIONS = [
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];
const PRICE_OPTIONS = [
  { value: "any", label: "Any price" },
  { value: "under30", label: "Under ¥30M" },
  { value: "30to60", label: "¥30M – ¥60M" },
  { value: "60to100", label: "¥60M – ¥100M" },
  { value: "over100", label: "Over ¥100M" },
];
const SIZE_OPTIONS = [
  { value: "any", label: "Any size" },
  { value: "40", label: "40 m² +" },
  { value: "60", label: "60 m² +" },
  { value: "80", label: "80 m² +" },
];
const WALK_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "5", label: "5 min or less" },
  { value: "10", label: "10 min or less" },
  { value: "15", label: "15 min or less" },
];

const PAGER_BASE = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-field px-3.5 text-sm no-underline";
const PAGER_IDLE = `${PAGER_BASE} border border-base-300 bg-base-100 font-medium text-base-content hover:bg-base-200`;
const PAGER_CURRENT = `${PAGER_BASE} border border-neutral bg-neutral font-semibold text-neutral-content`;
const PAGER_DISABLED = `${PAGER_BASE} border border-base-300 bg-base-100 text-base-content/40`;

const PAGE_WINDOW = 5;

interface FilterOption {
  value: string;
  label: string;
}

function FilterSelect({ name, label, value, options }: { name: string; label: string; value: string; options: FilterOption[] }) {
  return (
    <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
      <label htmlFor={name} className="text-[13px] font-semibold text-base-content/80">
        {label}
      </label>
      <select id={name} name={name} defaultValue={value} key={value} className="select min-h-11 w-full">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ListingCard({ property }: { property: ListingRow }) {
  const title = property.translated_property_name || property.property_name || property.address;
  const floorArea = floorAreaOf(property);
  const photos = photoCount(property);
  const latest = property.priceHistory[0];
  const previous = property.priceHistory[1];
  const cut = latest && previous && latest.price < previous.price ? previous.price - latest.price : 0;
  const detailHref = `/property/${property.id}`;

  return (
    <article className="flex flex-col overflow-hidden rounded-box border border-base-300 bg-base-100">
      <Link to={detailHref} tabIndex={-1} className="relative flex h-48 items-center justify-center bg-base-300 text-base-content/50 no-underline">
        {property.main_image_url ? (
          <img src={property.main_image_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span>No photo</span>
        )}
        {cut > 0 && (
          <span className="absolute left-2.5 top-2.5 rounded-md bg-error px-2 py-1 text-xs font-semibold text-error-content">
            ↓ {shortYen(cut)} cut
          </span>
        )}
        {photos > 0 && (
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-neutral/80 px-2 py-0.5 text-xs font-medium text-neutral-content">
            {photos} {photos === 1 ? "photo" : "photos"}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 px-[18px] pb-[18px] pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-2xl font-bold tracking-[-0.02em] tabular-nums">{yen(property.price)}</span>
          <span className="font-jp text-[13px] text-base-content/60 tabular-nums">{man(property.price)}</span>
        </div>

        <div className="flex min-w-0 flex-col gap-0.5">
          <Link to={detailHref} className="truncate font-semibold text-base-content no-underline hover:text-primary">
            {title}
          </Link>
          <span className="truncate font-jp text-[13px] text-base-content/60">{property.address}</span>
        </div>

        <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div className="flex flex-col">
            <dt className="text-xs text-base-content/60">Floor area</dt>
            <dd className="m-0 font-medium tabular-nums">{floorArea > 0 ? sqm(floorArea) : "—"}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-base-content/60">Per m²</dt>
            <dd className="m-0 font-medium tabular-nums">{floorArea > 0 ? yen(Math.round(property.price / floorArea)) : "—"}</dd>
          </div>
        </dl>

        <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-base-300/60 pt-3 text-sm">
          <span className="min-w-0 truncate">
            <strong className="font-semibold">{property.train_station}</strong> · {property.train_line}
          </span>
          {property.walking_minutes ? (
            <span className="ml-auto shrink-0 text-base-content/70 tabular-nums">{property.walking_minutes} min walk</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function PropertiesPage() {
  const { properties, countTotal, currentPage, totalPages, filters, selectedType, selectedArea, selectedProvince } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const filtersActive = hasActiveFilters(filters);

  // Keep the current filters when moving between pages.
  const pageHref = (target: number) => {
    const next = new URLSearchParams(searchParams);
    if (target <= 1) {
      next.delete("page");
    } else {
      next.set("page", String(target));
    }
    const query = next.toString();
    return query ? `?${query}` : "?";
  };

  const firstShown = (currentPage - 1) * LISTINGS_PER_PAGE + 1;
  const lastShown = Math.min(currentPage * LISTINGS_PER_PAGE, countTotal);

  const windowStart = Math.max(1, Math.min(currentPage - 2, totalPages - PAGE_WINDOW + 1));
  const windowEnd = Math.min(totalPages, windowStart + PAGE_WINDOW - 1);
  const pages = Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i);

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 pb-4 pt-8 sm:px-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-base-content/60">
        <Link to="/" className="text-base-content/60 hover:text-base-content">Home</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/areas/${selectedType.id}`} className="text-base-content/60 hover:text-base-content">{selectedType.name}</Link>
        <span aria-hidden="true">/</span>
        <span>{selectedArea.name}</span>
        <span aria-hidden="true">/</span>
        <span className="text-base-content">{selectedProvince.name}</span>
      </nav>

      <div className="flex flex-col gap-2.5">
        <h1 className="m-0 font-display text-[clamp(30px,4vw,42px)] leading-[1.1] tracking-[-0.025em]">
          {selectedType.name} in {selectedProvince.name}
        </h1>
        <p className="m-0 text-base-content/80">
          <strong className="font-semibold text-base-content tabular-nums">{countTotal.toLocaleString("en-US")}</strong> listings
        </p>
      </div>

      <Form method="get" className="flex flex-wrap items-end gap-3 rounded-box border border-base-300 bg-base-100 p-4">
        <FilterSelect name="sort" label="Sort by" value={filters.sort} options={SORT_OPTIONS} />
        <FilterSelect name="price" label="Price" value={filters.price} options={PRICE_OPTIONS} />
        <FilterSelect name="size" label="Floor area" value={filters.size} options={SIZE_OPTIONS} />
        <FilterSelect name="walk" label="Walk to station" value={filters.walk} options={WALK_OPTIONS} />
        <button type="submit" className="btn btn-primary min-h-11 px-5.5">
          Apply
        </button>
      </Form>

      {countTotal === 0 ? (
        <div className="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-6">
          <p className="m-0">{filtersActive ? "No listings match these filters." : "No listings in this area yet."}</p>
          {filtersActive && (
            <Link to="." className="font-medium text-primary">
              Clear filters
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(270px,100%),1fr))] gap-5">
            {properties.map((property: ListingRow) => (
              <ListingCard key={property.id} property={property} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-4">
              <span className="text-sm text-base-content/70">
                Showing {firstShown}–{lastShown} of {countTotal.toLocaleString("en-US")}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {currentPage > 1 ? (
                  <Link to={pageHref(currentPage - 1)} className={PAGER_IDLE}>Previous</Link>
                ) : (
                  <span aria-disabled="true" className={PAGER_DISABLED}>Previous</span>
                )}

                {windowStart > 1 && (
                  <>
                    <Link to={pageHref(1)} className={PAGER_IDLE}>1</Link>
                    {windowStart > 2 && <span aria-hidden="true" className="px-1 text-base-content/60">…</span>}
                  </>
                )}

                {pages.map((page) => (
                  <Link
                    key={page}
                    to={pageHref(page)}
                    aria-current={page === currentPage ? "page" : undefined}
                    className={page === currentPage ? PAGER_CURRENT : PAGER_IDLE}
                  >
                    {page}
                  </Link>
                ))}

                {windowEnd < totalPages && (
                  <>
                    {windowEnd < totalPages - 1 && <span aria-hidden="true" className="px-1 text-base-content/60">…</span>}
                    <Link to={pageHref(totalPages)} className={PAGER_IDLE}>{totalPages}</Link>
                  </>
                )}

                {currentPage < totalPages ? (
                  <Link to={pageHref(currentPage + 1)} className={PAGER_IDLE}>Next</Link>
                ) : (
                  <span aria-disabled="true" className={PAGER_DISABLED}>Next</span>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
