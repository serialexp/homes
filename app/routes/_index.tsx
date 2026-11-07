import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { areas, propertyTypes } from "../data/propertyData.js";
import prisma from "../utils/db.server.js";

// For rentals, we only have one type (040)
const RENTAL_TYPE_ID = '040';

// The five purchase types, in the redesign's order, with their Japanese labels.
const PURCHASE_TYPES: { id: string; jp: string }[] = [
  { id: '010', jp: '新築マンション' },
  { id: '011', jp: '中古マンション' },
  { id: '020', jp: '新築一戸建て' },
  { id: '021', jp: '中古一戸建て' },
  { id: '030', jp: '土地' },
];

// Every prefecture with the area it belongs to, in JIS code order.
const PREFECTURES = Object.entries(areas)
  .flatMap(([areaId, area]) => Object.entries(area.provinces).map(([id, name]) => ({ id, name: String(name), areaId })))
  .sort((a, b) => a.id.localeCompare(b.id));

export async function loader(_args: LoaderFunctionArgs) {
  // Get counts per property type and total rental units
  const [propertyCounts, rentalCount] = await Promise.all([
    prisma.property.groupBy({
      by: ['section_type'],
      _count: true,
    }),
    prisma.rentalUnit.count(),
  ]);

  const countsByType: Record<string, number> = {};
  for (const row of propertyCounts) {
    if (row.section_type) countsByType[row.section_type] = row._count;
  }

  return json({
    countsByType,
    rentalCount,
  });
}

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export default function Index() {
  const { countsByType, rentalCount } = useLoaderData<typeof loader>();
  const [provinceId, setProvinceId] = useState("13");

  const province = PREFECTURES.find((p) => p.id === provinceId) ?? PREFECTURES[0];
  const rentHref = `/rental/properties/${RENTAL_TYPE_ID}/${province.areaId}/${province.id}`;

  return (
    <div>
      <section className="mx-auto flex max-w-[1280px] flex-wrap items-end gap-12 px-4 pb-14 pt-16 sm:px-8">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <p className="m-0 font-jp text-sm font-medium tracking-[0.08em] text-base-content/60">日本の不動産 · 英語で</p>
          <h1 className="m-0 font-display text-[clamp(40px,6vw,72px)] leading-[1.02] font-bold tracking-[-0.03em] text-balance">
            Homes across Japan, readable in English.
          </h1>
          <p className="m-0 max-w-[560px] text-lg text-base-content/80 text-pretty">
            Rentals and homes for sale from Suumo, refreshed every morning. Translated details, train-line filters and price history in one place.
          </p>
        </div>

        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4 rounded-box border border-base-300 bg-base-100 p-6">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pref" className="text-[13px] font-semibold text-base-content/80">Prefecture</label>
            <select
              id="pref"
              value={province.id}
              onChange={(event) => setProvinceId(event.target.value)}
              className="min-h-[46px] rounded-field border border-base-300 bg-base-100 px-3 text-base-content"
            >
              {PREFECTURES.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <Link
            to={rentHref}
            className="flex min-h-12 items-center justify-center gap-2 rounded-field bg-primary font-semibold text-primary-content no-underline hover:bg-primary/85"
          >
            Show rentals in {province.name}
            <ArrowRight />
          </Link>
        </div>
      </section>

      <section aria-labelledby="rent-h" className="mx-auto max-w-[1280px] px-4 sm:px-8">
        <Link
          to={`/rental/areas/${RENTAL_TYPE_ID}`}
          className="flex flex-wrap items-center justify-between gap-8 rounded-box bg-neutral p-10 text-neutral-content no-underline hover:text-neutral-content hover:bg-neutral/95"
        >
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2">
            <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.1em] text-neutral-content/70">Rent · 賃貸</p>
            <h2 id="rent-h" className="m-0 font-display text-[34px] leading-[1.1] tracking-[-0.02em]">Find a place by the line you ride</h2>
            <p className="m-0 max-w-[520px] text-neutral-content/80">Browse buildings by region, then narrow to a train line, a station and a rent range. Every unit in the building, side by side.</p>
          </div>
          <div className="flex flex-wrap items-center gap-8">
            <div className="flex flex-col">
              <span className="font-display text-[44px] font-bold tabular-nums tracking-[-0.02em]">{rentalCount.toLocaleString()}</span>
              <span className="text-sm text-neutral-content/70">units available</span>
            </div>
            <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-content">
              <ArrowRight />
            </span>
          </div>
        </Link>
      </section>

      <section aria-labelledby="buy-h" className="mx-auto flex max-w-[1280px] flex-col gap-5 px-4 pt-16 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="buy-h" className="m-0 font-display text-[28px] tracking-[-0.02em]">
            Buy <span className="font-jp text-base font-medium tracking-normal text-base-content/60">売買</span>
          </h2>
          <p className="m-0 text-sm text-base-content/60">Mansion (マンション) means a condominium apartment.</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
          {PURCHASE_TYPES.map((type) => (
            <Link
              key={type.id}
              to={`/areas/${type.id}`}
              className="flex min-h-[196px] flex-col justify-between gap-7 rounded-box border border-base-300 bg-base-100 p-5 text-base-content no-underline hover:border-primary"
            >
              <div className="flex flex-col gap-1">
                <span className="font-jp text-[13px] text-base-content/60">{type.jp}</span>
                <span className="text-lg font-semibold leading-tight">{propertyTypes[type.id]}</span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="flex flex-col">
                  <span className="font-display text-[28px] font-bold tabular-nums tracking-[-0.02em]">
                    {(countsByType[type.id] || 0).toLocaleString()}
                  </span>
                  <span className="text-[13px] text-base-content/60">listings</span>
                </div>
                <ArrowRight className="text-primary" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
