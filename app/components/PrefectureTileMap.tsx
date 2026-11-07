import type { CSSProperties } from "react";
import { Link } from "@remix-run/react";
import {
  islandOffset,
  tileBucket,
  tileLegend,
  tileNameSize,
  type PrefectureTile,
} from "../utils/prefectureTiles.js";

export interface PrefectureTileView extends PrefectureTile {
  name: string;
  count: number;
  href: string;
}

function tileColor(bucket: number): string {
  return `var(--color-map-${bucket + 1})`;
}

/**
 * Stylised prefecture map: one tile per prefecture, coloured by its listing count.
 * Each tile is a link to that prefecture's listings. Layout comes from app/utils/prefectureTiles.ts.
 */
export function PrefectureTileMap({ tiles, countNoun = "listings" }: { tiles: PrefectureTileView[]; countNoun?: string }) {
  return (
    <figure className="m-0 flex flex-col gap-5 rounded-box border border-base-300 bg-base-100 p-6">
      <ul aria-label={`Legend: ${countNoun} per prefecture`} className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0">
        {tileLegend().map(({ bucket, label }) => (
          <li key={bucket} className="flex items-center gap-2 text-xs tabular-nums text-base-content/80">
            <span
              aria-hidden="true"
              className="inline-block size-4 rounded-sm"
              style={{ background: tileColor(bucket) }}
            />
            {label}
          </li>
        ))}
      </ul>
      <div className="overflow-x-auto">
        <div
          className="grid w-max gap-1.5 pb-[90px] pr-[60px]"
          style={{ gridTemplateColumns: "repeat(13, 76px)", gridAutoRows: "64px" }}
        >
          {tiles.map((tile) => {
            const bucket = tileBucket(tile.count);
            const offset = islandOffset(tile.island);
            const style: CSSProperties = {
              gridColumn: `${tile.col} / span ${tile.colSpan}`,
              gridRow: `${tile.row} / span ${tile.rowSpan}`,
              left: offset.x,
              top: offset.y,
              background: tileColor(bucket),
              color: bucket >= 3 ? "var(--color-base-100)" : "var(--color-base-content)",
            };
            return (
              <Link
                key={tile.code}
                to={tile.href}
                aria-label={`${tile.name}, ${tile.count.toLocaleString("en-US")} ${countNoun}`}
                className={`relative flex min-w-0 flex-col justify-between rounded-md px-1.5 py-1.5 no-underline transition-[transform,box-shadow] duration-100 hover:-translate-y-px hover:shadow-[0_0_0_2px_var(--color-base-100),0_0_0_4px_var(--color-accent)] focus-visible:shadow-[0_0_0_2px_var(--color-base-100),0_0_0_4px_var(--color-accent)] focus-visible:outline-none`}
                style={style}
              >
                <span
                  className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold leading-tight"
                  style={{ fontSize: tileNameSize(tile.name, tile.colSpan, tile.rowSpan) }}
                >
                  {tile.name}
                </span>
                <span className="text-xs tabular-nums opacity-90">{tile.count.toLocaleString("en-US")}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </figure>
  );
}
