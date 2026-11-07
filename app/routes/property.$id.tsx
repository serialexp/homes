import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { areas, propertyTypes } from "../data/propertyData.js";
import prisma from "../utils/db.server.js";

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Response("Invalid property", { status: 400 });
  }

  const property = await prisma.property.findUnique({
    where: { id },
    include: { priceHistory: { orderBy: { recorded_at: "asc" } } },
  });
  if (!property) {
    throw new Response("Property not found", { status: 404 });
  }

  return json({ property });
}

const yen = (n: number) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);
const man = (n: number) => `${Math.round(n / 10000).toLocaleString("ja-JP")}万円`;
const sqm = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} m²`;
const shortDate = (value: string | Date) =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function galleryImages(main: string | null, additional: string | null): string[] {
  const extra = additional ? additional.split(",").map((url) => url.trim()).filter(Boolean) : [];
  return [main, ...extra].filter((url): url is string => Boolean(url));
}

function PriceChart({ prices, label }: { prices: number[]; label: string }) {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min;
  const points = prices.map((price, i) => {
    const x = prices.length === 1 ? 4 : 4 + (i / (prices.length - 1)) * 292;
    const y = range === 0 ? 42 : 64 - ((price - min) / range) * 44;
    return { x, y };
  });
  return (
    <svg role="img" aria-label={label} viewBox="0 0 300 90" className="block h-[90px] w-full">
      <line x1="0" y1="84" x2="300" y2="84" stroke="var(--color-base-300)" strokeWidth="1" />
      <polyline
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill={i === points.length - 1 ? "var(--color-primary)" : "var(--color-base-100)"} stroke="var(--color-primary)" strokeWidth="2" />
      ))}
    </svg>
  );
}

export default function PropertyDetailPage() {
  const { property } = useLoaderData<typeof loader>();
  const images = galleryImages(property.main_image_url, property.additional_image_urls);
  const [imageIndex, setImageIndex] = useState(0);

  const provinceName = areas[property.region]?.provinces[property.province];
  const areaName = areas[property.region]?.name;
  const typeName = property.section_type ? propertyTypes[property.section_type] : undefined;
  const listingsHref =
    property.section_type && areas[property.region]
      ? `/properties/${property.section_type}/${property.region}/${property.province}`
      : "/";

  const title = property.translated_property_name || property.property_name || property.address;
  const history = property.priceHistory.map((entry) => ({ price: entry.price, recordedAt: entry.recorded_at }));
  const latest = history.at(-1);
  const previous = history.at(-2);
  const reduction = latest && previous && latest.price < previous.price ? previous.price - latest.price : 0;
  const tags = property.property_tags ? property.property_tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [];

  const facts: [string, string][] = [
    ["Property type", property.property_type],
    ["Layout", property.type ?? "—"],
    ["Land area", property.area > 0 ? sqm(property.area) : "—"],
    ["Building area", property.building_area > 0 ? sqm(property.building_area) : "—"],
    ["Building coverage", property.building_coverage ? `${property.building_coverage}%` : "—"],
    ["Floor area ratio", property.floor_area_ratio ? `${property.floor_area_ratio}%` : "—"],
    ["Train line", property.train_line],
    ["Nearest station", property.walking_minutes ? `${property.train_station} · ${property.walking_minutes} min walk` : property.train_station],
    ["Postal code", property.postal_code || "—"],
    ["Last updated", shortDate(property.last_updated)],
  ];

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-7 px-4 pb-4 pt-8 sm:px-8">
      <Link to={listingsHref} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-base-content no-underline hover:text-primary">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M11 18l-6-6 6-6" /></svg>
        {typeName && provinceName ? `${typeName} in ${provinceName}` : "Back to listings"}
      </Link>

      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-display text-[clamp(30px,4vw,44px)] leading-[1.1] tracking-[-0.025em]">{title}</h1>
        <p className="m-0 flex flex-wrap gap-3 text-base-content/80">
          {property.property_name && property.translated_property_name && (
            <span className="font-jp">{property.property_name}</span>
          )}
          {property.property_name && property.translated_property_name && <span aria-hidden="true" className="text-base-content/40">·</span>}
          <span>{property.address}</span>
          {areaName && provinceName && (
            <>
              <span aria-hidden="true" className="text-base-content/40">·</span>
              <span>{provinceName}, {areaName}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-8">
          <div className="flex flex-col gap-2.5">
            {images.length > 0 ? (
              <div className="relative aspect-[16/10] overflow-hidden rounded-box bg-base-300">
                <img src={images[imageIndex]} alt={`${title}, photo ${imageIndex + 1} of ${images.length}`} className="size-full object-cover" />
                {images.length > 1 && (
                  <span className="absolute bottom-3.5 right-3.5 rounded-md bg-neutral/80 px-2.5 py-0.5 text-[13px] font-medium text-neutral-content">
                    {imageIndex + 1} / {images.length}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex aspect-[16/10] items-center justify-center rounded-box bg-base-300 text-base-content/50">
                No photos for this listing
              </div>
            )}
            {images.length > 1 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                {images.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    aria-label={`Photo ${i + 1}`}
                    aria-pressed={i === imageIndex}
                    onClick={() => setImageIndex(i)}
                    className={`aspect-[4/3] overflow-hidden rounded-field bg-base-300 p-0 ${i === imageIndex ? "ring-2 ring-primary" : ""}`}
                  >
                    <img src={url} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <section aria-labelledby="facts-h" className="flex flex-col gap-3.5">
            <h2 id="facts-h" className="m-0 font-display text-[22px] tracking-[-0.01em]">Property details</h2>
            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] overflow-hidden rounded-box border border-base-300 bg-base-100">
              {facts.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 border-b border-r border-base-300/60 px-4.5 py-3.5">
                  <dt className="text-xs text-base-content/60">{label}</dt>
                  <dd className="m-0 font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {tags.length > 0 && (
            <section aria-labelledby="tags-h" className="flex flex-col gap-3.5">
              <h2 id="tags-h" className="m-0 font-display text-[22px] tracking-[-0.01em]">Features</h2>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {tags.map((tag) => (
                  <li key={tag} className="rounded-field border border-base-300 bg-base-100 px-3 py-2 text-sm font-medium">{tag}</li>
                ))}
              </ul>
            </section>
          )}

          {property.additional_fields && (
            <section aria-labelledby="more-h" className="flex flex-col gap-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="more-h" className="m-0 font-display text-[22px] tracking-[-0.01em]">From the listing</h2>
                <span className="text-[13px] text-base-content/60">Original Japanese, as listed on Suumo</span>
              </div>
              <pre className="m-0 whitespace-pre-wrap rounded-box border border-base-300 bg-base-100 p-4 font-jp text-sm">{property.additional_fields}</pre>
            </section>
          )}
        </div>

        <aside aria-label="Price and contact" className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <div className="flex flex-col gap-[18px] rounded-box border border-base-300 bg-base-100 p-6">
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-[38px] font-bold leading-[1.1] tracking-[-0.025em] tabular-nums">{yen(property.price)}</span>
              <span className="font-jp text-base-content/60">{man(property.price)}{property.price_per_tsubo ? ` · ${yen(Math.round(property.price_per_tsubo))} per tsubo` : ""}</span>
            </div>
            {reduction > 0 && latest && (
              <div className="flex items-center gap-2 rounded-field bg-error/10 px-3 py-2.5 text-sm font-medium text-error">
                Reduced {yen(reduction)} on {shortDate(latest.recordedAt)}
              </div>
            )}
            <dl className="m-0 grid grid-cols-2 gap-3.5">
              <div className="flex flex-col"><dt className="text-xs text-base-content/60">Land area</dt><dd className="m-0 font-semibold">{property.area > 0 ? sqm(property.area) : "—"}</dd></div>
              <div className="flex flex-col"><dt className="text-xs text-base-content/60">Building area</dt><dd className="m-0 font-semibold">{property.building_area > 0 ? sqm(property.building_area) : "—"}</dd></div>
              <div className="flex flex-col"><dt className="text-xs text-base-content/60">Layout</dt><dd className="m-0 font-semibold">{property.type ?? "—"}</dd></div>
              <div className="flex flex-col"><dt className="text-xs text-base-content/60">Station</dt><dd className="m-0 font-semibold">{property.train_station}</dd></div>
              <div className="flex flex-col"><dt className="text-xs text-base-content/60">Walk</dt><dd className="m-0 font-semibold">{property.walking_minutes ? `${property.walking_minutes} min` : "—"}</dd></div>
            </dl>
            <a
              href={property.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-field bg-primary font-semibold text-primary-content no-underline hover:bg-primary/85"
            >
              View on Suumo
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
            </a>
            <p className="m-0 text-center text-[13px] text-base-content/60">Contact and viewings are arranged through the listing agent on Suumo.</p>
          </div>

          {history.length > 0 && (
            <section aria-labelledby="hist-h" className="flex flex-col gap-3.5 rounded-box border border-base-300 bg-base-100 px-6 py-5">
              <h2 id="hist-h" className="m-0 text-base font-semibold">Price history</h2>
              {history.length > 1 && (
                <PriceChart
                  prices={history.map((h) => h.price)}
                  label={`Price went from ${yen(history[0].price)} to ${yen(history.at(-1)!.price)}`}
                />
              )}
              <ol className="m-0 flex list-none flex-col p-0 text-sm">
                {[...history].reverse().map((entry, i, all) => {
                  const older = all[i + 1];
                  const change = older ? entry.price - older.price : 0;
                  return (
                    <li key={`${entry.recordedAt}-${i}`} className="flex justify-between gap-2 border-t border-base-300/60 py-2">
                      <span className="text-base-content/60">{shortDate(entry.recordedAt)}</span>
                      <span className="tabular-nums">
                        {change < 0 && <span className="mr-2 font-semibold text-error">−{yen(-change)}</span>}
                        <span className="font-semibold">{yen(entry.price)}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {typeName && <p className="m-0 text-center text-xs text-base-content/50">{typeName} listing</p>}
        </aside>
      </div>

    </div>
  );
}
