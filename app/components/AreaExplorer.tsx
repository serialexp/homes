import { useMemo, useState } from "react";
import { Link } from "@remix-run/react";
import { PrefectureTileMap, type PrefectureTileView } from "./PrefectureTileMap.js";
import { PREFECTURE_TILES } from "../utils/prefectureTiles.js";

type Area = { name: string; provinces: Record<string, string> };
type View = "map" | "list";

const TOGGLE_BASE = "min-h-10 rounded-lg px-4 text-sm font-semibold";
const TOGGLE_ON = `${TOGGLE_BASE} bg-base-100 text-base-content shadow-sm`;
const TOGGLE_OFF = `${TOGGLE_BASE} text-base-content/70 hover:text-base-content`;

interface AreaExplorerProps {
  areas: Record<string, Area>;
  /** areaId -> provinceId -> count */
  countsByProvince: Record<string, Record<string, number>>;
  hrefFor: (areaId: string, provinceId: string) => string;
  /** What the counts are, e.g. "listings" or "units available". */
  countNoun: string;
}

/** Map and list of prefectures with counts; the same destinations from either view. */
export function AreaExplorer({ areas, countsByProvince, hrefFor, countNoun }: AreaExplorerProps) {
  const [view, setView] = useState<View>("map");

  // Flatten region -> prefecture -> count into prefecture -> count.
  const countByProvince = useMemo(() => {
    const flat: Record<string, number> = {};
    for (const provinces of Object.values(countsByProvince)) {
      for (const [provinceId, count] of Object.entries(provinces)) flat[provinceId] = count;
    }
    return flat;
  }, [countsByProvince]);

  // Each prefecture belongs to exactly one area.
  const areaOfProvince: Record<string, string> = {};
  const nameOfProvince: Record<string, string> = {};
  for (const [areaId, area] of Object.entries(areas)) {
    for (const [provinceId, provinceName] of Object.entries(area.provinces)) {
      areaOfProvince[provinceId] = areaId;
      nameOfProvince[provinceId] = String(provinceName);
    }
  }

  const tiles: PrefectureTileView[] = PREFECTURE_TILES.map((tile) => ({
    ...tile,
    name: nameOfProvince[tile.code] ?? tile.code,
    count: countByProvince[tile.code] ?? 0,
    href: hrefFor(areaOfProvince[tile.code], tile.code),
  }));

  const maxCount = useMemo(() => Math.max(1, ...Object.values(countByProvince)), [countByProvince]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-base-content/70">
          {view === "map"
            ? "Every prefecture is the same size here, so small ones are easy to pick. Select one to see its " + countNoun + "."
            : "Select a prefecture to see its " + countNoun + "."}
        </p>
        <div role="group" aria-label="View" className="flex gap-1 rounded-xl bg-base-300/60 p-1">
          <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")} className={view === "map" ? TOGGLE_ON : TOGGLE_OFF}>
            Map
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} className={view === "list" ? TOGGLE_ON : TOGGLE_OFF}>
            List
          </button>
        </div>
      </div>

      {view === "map" ? (
        <PrefectureTileMap tiles={tiles} countNoun={countNoun} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Object.entries(areas).map(([areaId, area]) => {
            const areaTotal = Object.values(countsByProvince[areaId] || {}).reduce((a, b) => a + b, 0);
            return (
              <section key={areaId} className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="m-0 text-lg font-semibold">{area.name}</h3>
                  <span className="text-sm tabular-nums text-base-content/60">
                    {areaTotal.toLocaleString("en-US")} {countNoun}
                  </span>
                </div>
                <ul className="m-0 flex list-none flex-col p-0">
                  {Object.entries(area.provinces).map(([provinceId, provinceName]) => {
                    const count = countsByProvince[areaId]?.[provinceId] || 0;
                    const percent = Math.max(3, Math.round((count / maxCount) * 100));
                    return (
                      <li key={provinceId} className="border-t border-base-300/60">
                        <Link
                          to={hrefFor(areaId, provinceId)}
                          className="grid min-h-11 grid-cols-[1fr_72px_64px] items-center gap-3 text-base-content no-underline hover:text-primary"
                        >
                          <span className="font-medium">{String(provinceName)}</span>
                          <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-base-300">
                            <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${percent}%` }} />
                          </span>
                          <span className="text-right text-sm tabular-nums">{count.toLocaleString("en-US")}</span>
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
