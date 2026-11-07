import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useMemo, useState } from "react";
import { Link, useLoaderData } from "@remix-run/react";
import { propertyTypes, areas } from "../data/propertyData.js";
import prisma from "../utils/db.server.js";
import { PrefectureTileMap, type PrefectureTileView } from "../components/PrefectureTileMap.js";
import { PREFECTURE_TILES } from "../utils/prefectureTiles.js";

export async function loader({ params }: LoaderFunctionArgs) {
  const typeId = params.typeId;

  if (!typeId || !propertyTypes[typeId as keyof typeof propertyTypes]) {
    throw new Response("Invalid property type", { status: 404 });
  }

  const provinceCounts = await prisma.property.groupBy({
    by: ['region', 'province'],
    where: { section_type: typeId },
    _count: true,
  });

  const countsByProvince: Record<string, Record<string, number>> = {};
  for (const row of provinceCounts) {
    if (!countsByProvince[row.region]) countsByProvince[row.region] = {};
    countsByProvince[row.region][row.province] = row._count;
  }

  return json({
    areas,
    selectedType: {
      id: typeId,
      name: propertyTypes[typeId as keyof typeof propertyTypes]
    },
    countsByProvince,
  });
}

type View = "map" | "list";

export default function AreasPage() {
  const { areas, selectedType, countsByProvince } = useLoaderData<typeof loader>();
  const [view, setView] = useState<View>("map");

  // Flatten region -> prefecture -> count into prefecture -> count.
  const countByProvince = useMemo(() => {
    const flat: Record<string, number> = {};
    for (const provinces of Object.values(countsByProvince)) {
      for (const [provinceId, count] of Object.entries(provinces)) flat[provinceId] = count;
    }
    return flat;
  }, [countsByProvince]);

  // Each prefecture belongs to exactly one area; the map and the list link to the same page.
  const areaOfProvince: Record<string, string> = {};
  const nameOfProvince: Record<string, string> = {};
  for (const [areaId, area] of Object.entries(areas)) {
    for (const [provinceId, provinceName] of Object.entries(area.provinces)) {
      areaOfProvince[provinceId] = areaId;
      nameOfProvince[provinceId] = String(provinceName);
    }
  }
  const hrefFor = (provinceId: string) =>
    `/properties/${selectedType.id}/${areaOfProvince[provinceId]}/${provinceId}`;

  const tiles: PrefectureTileView[] = PREFECTURE_TILES.map((tile) => ({
    ...tile,
    name: nameOfProvince[tile.code] ?? tile.code,
    count: countByProvince[tile.code] ?? 0,
    href: hrefFor(tile.code),
  }));

  const maxCount = useMemo(() => Math.max(1, ...Object.values(countByProvince)), [countByProvince]);

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/" className="text-primary hover:underline">← Back to Property Types</Link>
          <h2 className="mt-2 text-2xl font-bold">Select Area for {selectedType.name}</h2>
        </div>
        <div role="group" aria-label="View" className="flex gap-1 rounded-xl bg-base-300/60 p-1">
          <button
            type="button"
            aria-pressed={view === "map"}
            onClick={() => setView("map")}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${view === "map" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/70 hover:text-base-content"}`}
          >
            Map
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${view === "list" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/70 hover:text-base-content"}`}
          >
            List
          </button>
        </div>
      </div>

      {view === "map" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-base-content/60">
            Every prefecture is the same size here, so small ones are easy to pick. Select one to see its listings.
          </p>
          <PrefectureTileMap tiles={tiles} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Object.entries(areas).map(([areaId, area]) => {
            const areaTotal = Object.values(countsByProvince[areaId] || {}).reduce((a, b) => a + b, 0);
            return (
              <section key={areaId} className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold">{area.name}</h3>
                  <span className="text-sm tabular-nums text-base-content/60">{areaTotal.toLocaleString()} listings</span>
                </div>
                <ul className="m-0 flex list-none flex-col p-0">
                  {Object.entries(area.provinces).map(([provinceId, provinceName]) => {
                    const count = countsByProvince[areaId]?.[provinceId] || 0;
                    const percent = Math.max(3, Math.round((count / maxCount) * 100));
                    return (
                      <li key={provinceId} className="border-t border-base-300/60">
                        <Link
                          to={`/properties/${selectedType.id}/${areaId}/${provinceId}`}
                          className="grid min-h-11 grid-cols-[1fr_72px_64px] items-center gap-3 text-base-content no-underline hover:text-primary"
                        >
                          <span className="font-medium">{String(provinceName)}</span>
                          <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-base-300">
                            <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${percent}%` }} />
                          </span>
                          <span className="text-right text-sm tabular-nums">{count.toLocaleString()}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
