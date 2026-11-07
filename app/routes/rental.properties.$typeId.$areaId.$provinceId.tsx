import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { Prisma, type TrainLine } from "@prisma/client";
import type { ReactNode } from "react";
import prisma from "../utils/db.server.js";
import { areas } from "../data/propertyData.js";
import { translateWithCache } from "../utils/llm.server.js";
import { sqm, yen } from "../utils/format.js";
import { Pagination } from "../components/Pagination.js";

// For rentals, we only have one type (040)
const RENTAL_TYPE_ID = "040";
const RENTAL_TYPE_NAME = "Rental";

const ITEMS_PER_PAGE = 10;
const UNITS_PER_BUILDING = 20;

/** Display label for a train line: canonical match wins, then AI romaji, then raw. */
function lineLabel(line: Pick<TrainLine, "canonical_name" | "translated_name" | "name">): string {
  return line.canonical_name || line.translated_name || line.name;
}

// Monthly rent bands in yen. min 0 is no lower bound; max null is open-ended.
const PRICE_RANGES = [
  { min: 0, max: 50000, label: "Under ¥50,000" },
  { min: 50000, max: 75000, label: "¥50,000 – ¥75,000" },
  { min: 75000, max: 100000, label: "¥75,000 – ¥100,000" },
  { min: 100000, max: 150000, label: "¥100,000 – ¥150,000" },
  { min: 150000, max: 200000, label: "¥150,000 – ¥200,000" },
  { min: 200000, max: 300000, label: "¥200,000 – ¥300,000" },
  { min: 300000, max: null, label: "Over ¥300,000" },
];

/** A whole number from the query string, or null when absent or not a number. */
function wholeNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { typeId, areaId, provinceId } = params;
  const url = new URL(request.url);
  const requestedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const trainLineId = wholeNumber(url.searchParams.get("trainLine")) || null;
  const stationId = wholeNumber(url.searchParams.get("station")) || null;
  const minPrice = wholeNumber(url.searchParams.get("minPrice"));
  const maxPrice = wholeNumber(url.searchParams.get("maxPrice"));

  if (typeId !== RENTAL_TYPE_ID) {
    throw new Response("Invalid property type", { status: 404 });
  }
  if (!areaId || !areas[areaId]) {
    throw new Response("Invalid area", { status: 404 });
  }
  const area = areas[areaId];
  if (!provinceId || !area.provinces[provinceId]) {
    throw new Response("Invalid province", { status: 404 });
  }

  const scope = { region: areaId, province: provinceId };
  const buildingWhere: Prisma.BuildingWhereInput = {
    ...scope,
    ...(stationId
      ? { buildingStations: { some: { station_id: stationId } } }
      : trainLineId
        ? { buildingStations: { some: { station: { train_line_id: trainLineId } } } }
        : {}),
  };
  const unitRentWhere: Prisma.RentalUnitWhereInput = {
    AND: [
      ...(minPrice ? [{ rent: { gte: minPrice } }] : []),
      ...(maxPrice ? [{ rent: { lte: maxPrice } }] : []),
    ],
  };

  const [trainLineRows, lineCountRows, stationRows, totalBuildingsInArea, buildings, countTotal, unitCount] =
    await Promise.all([
      // Lines that run past a building in this area.
      prisma.trainLine.findMany({
        where: { stations: { some: { buildingStations: { some: { building: scope } } } } },
        orderBy: { translated_name: "asc" },
      }),
      // Buildings per line in this area, in one grouped query.
      prisma.$queryRaw<Array<{ train_line_id: number; buildings: bigint }>>`
        SELECT s.train_line_id, COUNT(DISTINCT bs.building_id) AS buildings
        FROM building_station bs
        JOIN station s ON s.id = bs.station_id
        JOIN building b ON b.id = bs.building_id
        WHERE b.region = ${areaId} AND b.province = ${provinceId}
        GROUP BY s.train_line_id
      `,
      trainLineId
        ? prisma.station.findMany({
            where: { train_line_id: trainLineId, buildingStations: { some: { building: scope } } },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
      prisma.building.count({ where: scope }),
      prisma.building.findMany({
        where: { ...buildingWhere, rentalUnits: { some: unitRentWhere } },
        include: {
          buildingStations: { include: { station: { include: { train_line: true } } } },
          rentalUnits: { where: unitRentWhere, orderBy: { rent: "asc" }, take: UNITS_PER_BUILDING },
        },
        orderBy: { last_updated: "desc" },
        skip: (page - 1) * ITEMS_PER_PAGE,
        take: ITEMS_PER_PAGE,
      }),
      prisma.building.count({ where: { ...buildingWhere, rentalUnits: { some: unitRentWhere } } }),
      prisma.rentalUnit.count({ where: { ...unitRentWhere, building: buildingWhere } }),
    ]);

  const lineCounts = new Map(lineCountRows.map((row) => [row.train_line_id, Number(row.buildings)]));
  const trainLines = trainLineRows.map((line) => ({
    id: line.id,
    label: lineLabel(line),
    bus: line.kind === "bus",
    buildingCount: lineCounts.get(line.id) ?? 0,
  }));
  const selectedTrainLine = trainLines.find((line) => line.id === trainLineId) ?? null;

  const stations = stationRows.map((station) => ({
    id: station.id,
    label: station.translated_name || station.name,
  }));
  const selectedStation = stations.find((station) => station.id === stationId) ?? null;

  // "any", the index of a preset band, or "custom" for bounds the presets do not cover.
  const priceChoice =
    minPrice === null && maxPrice === null
      ? "any"
      : (() => {
          const index = PRICE_RANGES.findIndex((range) => range.min === (minPrice ?? 0) && range.max === (maxPrice ?? null));
          return index >= 0 ? String(index) : "custom";
        })();

  // Collect the unique Japanese strings shown on the building cards and translate them.
  const textsToTranslate: string[] = [];
  for (const building of buildings) {
    if (building.building_type) textsToTranslate.push(building.building_type);
    if (building.age) textsToTranslate.push(building.age);
    if (building.floors) textsToTranslate.push(building.floors);
    if (building.state) textsToTranslate.push(building.state);
    if (building.city) textsToTranslate.push(building.city);
    if (building.district) textsToTranslate.push(building.district);
  }

  // Batch translate (cache-backed, only calls LLM for new strings)
  let translations = new Map<string, string>();
  try {
    translations = await translateWithCache(textsToTranslate);
  } catch (error) {
    console.error("Translation failed, showing original Japanese:", error);
  }

  return json({
    buildings,
    translations: Object.fromEntries(translations),
    trainLines,
    stations,
    selectedTrainLine,
    selectedStation,
    priceRanges: PRICE_RANGES,
    priceChoice,
    allBuildingCount: totalBuildingsInArea,
    countTotal,
    unitCount,
    currentPage: page,
    totalPages: Math.ceil(countTotal / ITEMS_PER_PAGE),
    selectedType: {
      id: RENTAL_TYPE_ID,
      name: RENTAL_TYPE_NAME,
    },
    selectedArea: {
      id: areaId,
      name: area.name,
    },
    selectedProvince: {
      id: provinceId,
      name: area.provinces[provinceId],
    },
  });
}

function FilterGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend className="mb-2 p-0 text-xs font-bold uppercase tracking-[0.06em] text-base-content/70">{legend}</legend>
      {children}
    </fieldset>
  );
}

const FILTER_ROW = "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-field px-2.5";

export default function RentalPropertiesPage() {
  const {
    buildings,
    translations,
    trainLines,
    stations,
    selectedTrainLine,
    selectedStation,
    priceRanges,
    priceChoice,
    allBuildingCount,
    countTotal,
    unitCount,
    currentPage,
    totalPages,
    selectedType,
    selectedArea,
    selectedProvince,
  } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Look up a cached translation, falling back to the original text
  const t = (text: string | null | undefined) => {
    if (!text) return "-";
    return translations[text] || text;
  };

  // The current URL with some filters changed. Any filter change goes back to page 1.
  const hrefWith = (changes: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!keepPage) next.delete("page");
    const query = next.toString();
    return query ? `?${query}` : "?";
  };
  const applyFilters = (changes: Record<string, string | null>) => navigate(hrefWith(changes));

  const formatAge = (dateStr: string) => {
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "today";
    if (days === 1) return "1 day ago";
    if (days < 7) return `${days} days ago`;
    if (days < 14) return "1 week ago";
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 60) return "1 month ago";
    return `${Math.floor(days / 30)} months ago`;
  };

  const priceChoices = [
    { value: "any", label: "Any rent", minPrice: null, maxPrice: null },
    ...priceRanges.map((range, index) => ({
      value: String(index),
      label: range.label,
      minPrice: range.min > 0 ? String(range.min) : null,
      maxPrice: range.max === null ? null : String(range.max),
    })),
  ];
  const activePriceLabel =
    priceChoice === "any" ? null : priceChoice === "custom" ? "Custom rent" : priceRanges[Number(priceChoice)].label;

  const hasFilters = Boolean(selectedTrainLine || selectedStation || activePriceLabel);
  const firstShown = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const lastShown = Math.min(currentPage * ITEMS_PER_PAGE, countTotal);

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-7 px-4 pb-4 pt-8 sm:px-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-base-content/60">
        <Link to="/" className="text-base-content/60 hover:text-base-content">Home</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/rental/areas/${selectedType.id}`} className="text-base-content/60 hover:text-base-content">Rent</Link>
        <span aria-hidden="true">/</span>
        <span>{selectedArea.name}</span>
        <span aria-hidden="true">/</span>
        <span className="text-base-content">{selectedProvince.name}</span>
      </nav>

      <div className="flex flex-col gap-2.5">
        <h1 className="m-0 font-display text-[clamp(30px,4vw,42px)] leading-[1.1] tracking-[-0.025em]">
          {selectedTrainLine ? `Rentals along the ${selectedTrainLine.label}` : `Rentals in ${selectedProvince.name}`}
        </h1>
        <p className="m-0 text-base-content/80">
          <strong className="font-semibold text-base-content tabular-nums">{countTotal.toLocaleString("en-US")}</strong> buildings ·{" "}
          <strong className="font-semibold text-base-content tabular-nums">{unitCount.toLocaleString("en-US")}</strong> units available
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-7">
        <aside aria-label="Filters" className="flex min-w-0 flex-[1_1_280px] flex-col gap-5 rounded-box border border-base-300 bg-base-100 p-5">
          <FilterGroup legend="Train line">
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              <label className={`${FILTER_ROW} ${!selectedTrainLine ? "bg-base-200 font-semibold" : ""}`}>
                <input
                  type="radio"
                  name="line"
                  value=""
                  checked={!selectedTrainLine}
                  onChange={() => applyFilters({ trainLine: null, station: null })}
                  className="radio radio-primary radio-sm"
                />
                <span className="flex-1">All lines</span>
                <span className="text-[13px] tabular-nums text-base-content/60">{allBuildingCount.toLocaleString("en-US")}</span>
              </label>
              {trainLines.map((line) => {
                const selected = selectedTrainLine?.id === line.id;
                return (
                  <label key={line.id} className={`${FILTER_ROW} ${selected ? "bg-base-200 font-semibold" : ""}`}>
                    <input
                      type="radio"
                      name="line"
                      value={line.id}
                      checked={selected}
                      onChange={() => applyFilters({ trainLine: String(line.id), station: null })}
                      className="radio radio-primary radio-sm"
                    />
                    <span className="flex-1 truncate">{line.label}</span>
                    {line.bus && <span className="badge badge-ghost badge-sm">Bus</span>}
                    <span className="text-[13px] tabular-nums text-base-content/60">{line.buildingCount.toLocaleString("en-US")}</span>
                  </label>
                );
              })}
            </div>
          </FilterGroup>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.06em] text-base-content/70">Station</span>
            <select
              value={selectedStation?.id ?? ""}
              disabled={!selectedTrainLine}
              onChange={(event) => applyFilters({ station: event.target.value })}
              className="select min-h-11 w-full"
            >
              <option value="">All stations on this line</option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.label}
                </option>
              ))}
            </select>
          </label>

          <FilterGroup legend="Monthly rent">
            {priceChoices.map((choice) => (
              <label key={choice.value} className={`${FILTER_ROW} ${priceChoice === choice.value ? "bg-base-200 font-semibold" : ""}`}>
                <input
                  type="radio"
                  name="rent"
                  value={choice.value}
                  checked={priceChoice === choice.value}
                  onChange={() => applyFilters({ minPrice: choice.minPrice, maxPrice: choice.maxPrice })}
                  className="radio radio-primary radio-sm"
                />
                <span className="tabular-nums">{choice.label}</span>
              </label>
            ))}
          </FilterGroup>
        </aside>

        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          {hasFilters && (
            <ul aria-label="Active filters" className="m-0 flex list-none flex-wrap gap-2 p-0">
              {selectedTrainLine && (
                <li>
                  <Link
                    to={hrefWith({ trainLine: null, station: null })}
                    aria-label={`Remove filter: ${selectedTrainLine.label}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-3 pr-2.5 text-sm font-semibold text-primary no-underline hover:bg-primary/20"
                  >
                    {selectedTrainLine.label}
                    <span aria-hidden="true">✕</span>
                  </Link>
                </li>
              )}
              {selectedStation && (
                <li>
                  <Link
                    to={hrefWith({ station: null })}
                    aria-label={`Remove filter: ${selectedStation.label}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-3 pr-2.5 text-sm font-semibold text-primary no-underline hover:bg-primary/20"
                  >
                    {selectedStation.label}
                    <span aria-hidden="true">✕</span>
                  </Link>
                </li>
              )}
              {activePriceLabel && (
                <li>
                  <Link
                    to={hrefWith({ minPrice: null, maxPrice: null })}
                    aria-label={`Remove filter: ${activePriceLabel}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-3 pr-2.5 text-sm font-semibold text-primary no-underline hover:bg-primary/20"
                  >
                    {activePriceLabel}
                    <span aria-hidden="true">✕</span>
                  </Link>
                </li>
              )}
            </ul>
          )}

          {countTotal === 0 ? (
            <div className="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-6">
              <p className="m-0">
                {hasFilters ? "No rental buildings match these filters." : "No rental buildings in this area yet."}
              </p>
              {hasFilters && (
                <Link to="." className="font-medium text-primary">
                  Clear filters
                </Link>
              )}
            </div>
          ) : (
            <>
              {buildings.map((building) => {
                const title = building.title || building.address;
                const addressLine = [t(building.district), t(building.city), t(building.state)]
                  .filter((part) => part && part !== "-")
                  .join(", ");
                const meta = [t(building.building_type), t(building.age), t(building.floors)].filter((part) => part !== "-");

                return (
                  <article key={building.id} className="overflow-hidden rounded-box border border-base-300 bg-base-100">
                    <div className="flex flex-wrap gap-5 p-5">
                      <div className="relative h-[126px] w-[168px] shrink-0 overflow-hidden rounded-field bg-base-300">
                        {building.main_image_url ? (
                          <img src={building.main_image_url} alt="" loading="lazy" className="size-full object-cover" />
                        ) : null}
                      </div>

                      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-3">
                          <h2 className="m-0 font-display text-lg font-semibold leading-snug">{title}</h2>
                          <span className="text-[13px] text-base-content/60">Updated {formatAge(building.last_updated as unknown as string)}</span>
                        </div>
                        {addressLine && <p className="m-0 text-base-content/80">{addressLine}</p>}
                        {meta.length > 0 && (
                          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                            {meta.map((item) => (
                              <li key={item} className="rounded-md bg-base-200 px-2.5 py-0.5 text-[13px] font-medium text-base-content/80">
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <ul aria-label="Nearby stations" className="m-0 flex min-w-0 flex-[1_1_240px] list-none flex-col gap-1.5 p-0">
                        {building.buildingStations.map((link) => {
                          const onSelectedLine = selectedTrainLine?.id === link.station.train_line.id;
                          const onSelectedStation = selectedStation?.id === link.station.id;
                          const highlighted = onSelectedStation || (!selectedStation && onSelectedLine);
                          return (
                            <li
                              key={link.id}
                              className={`flex items-center gap-2.5 text-sm ${highlighted ? "font-semibold text-base-content" : "text-base-content/70"}`}
                            >
                              <span
                                aria-hidden="true"
                                className={`size-2 shrink-0 rounded-full ${highlighted ? "bg-primary" : "bg-base-300"}`}
                              />
                              <span className="min-w-0 flex-1 truncate">
                                <strong className="font-semibold">{link.station.translated_name || link.station.name}</strong>
                                {" · "}
                                {lineLabel(link.station.train_line)}
                                {link.station.train_line.kind === "bus" && <span className="badge badge-ghost badge-sm ml-1">Bus</span>}
                              </span>
                              <span className="shrink-0 tabular-nums">{link.walking_minutes} min walk</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    <div className="overflow-x-auto border-t border-base-300">
                      <table className="w-full min-w-[640px] border-collapse text-sm tabular-nums">
                        <caption className="sr-only">Available units in {title}</caption>
                        <thead>
                          <tr className="bg-base-200/60 text-left text-xs font-semibold uppercase tracking-[0.05em] text-base-content/60">
                            <th scope="col" className="px-5 py-2.5 font-semibold">Floor</th>
                            <th scope="col" className="px-3 py-2.5 font-semibold">Layout</th>
                            <th scope="col" className="px-3 py-2.5 font-semibold">Size</th>
                            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Rent</th>
                            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Mgmt fee</th>
                            <th scope="col" className="px-3 py-2.5 font-semibold">Deposit / Key money</th>
                            <th scope="col" className="px-5 py-2.5 text-right font-semibold">
                              <span className="sr-only">Listing</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {building.rentalUnits.map((unit) => (
                            <tr key={unit.id} className="border-t border-base-300/60">
                              <td className="px-5 py-2.5">{unit.floor ?? "—"}</td>
                              <td className="px-3 py-2.5 font-semibold">{unit.layout ?? "—"}</td>
                              <td className="px-3 py-2.5">{unit.size_text || (unit.size > 0 ? sqm(unit.size) : "—")}</td>
                              <td className="px-3 py-2.5 text-right text-[15px] font-bold">{unit.rent_text || yen(unit.rent)}</td>
                              <td className="px-3 py-2.5 text-right text-base-content/80">
                                {unit.management_fee_text || (unit.management_fee > 0 ? yen(unit.management_fee) : "—")}
                              </td>
                              <td className="px-3 py-2.5 text-base-content/80">
                                {unit.deposit || "—"} / {unit.gratuity || "—"}
                              </td>
                              <td className="px-5 py-2.5 text-right">
                                <a
                                  href={unit.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex min-h-9 items-center font-medium text-primary no-underline hover:underline"
                                >
                                  Suumo ↗
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {building.rentalUnits.length === UNITS_PER_BUILDING && (
                        <p className="m-0 border-t border-base-300/60 px-5 py-2 text-xs text-base-content/60">
                          Showing the first {UNITS_PER_BUILDING} units by rent.
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageHref={(page) => hrefWith({ page: page <= 1 ? null : String(page) }, true)}
                summary={`Showing ${firstShown}–${lastShown} of ${countTotal.toLocaleString("en-US")} buildings`}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
