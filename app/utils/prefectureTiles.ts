// Layout and colour bucketing for the prefecture tile map on the area page.
// Every prefecture is one tile on a 13 x 13 grid, so small prefectures are as easy to pick as large ones.
// Positions come from the redesign's stylised map; islands are nudged so there is a gap between them.

export type Island = "hokkaido" | "honshu" | "shikoku" | "kyushu" | "okinawa";

export interface PrefectureTile {
  /** Prefecture code "01".."47", the same ids as the province ids in propertyData. */
  code: string;
  /** 1-based grid column and row of the tile's top-left cell, and its size in cells. */
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  island: Island;
}

export const TILE_WIDTH = 76;
export const TILE_HEIGHT = 64;
export const TILE_GAP = 6;

const ISLAND_OFFSET_PX = 30;

const ISLAND_OFFSETS: Record<Island, { x: number; y: number }> = {
  hokkaido: { x: 2 * ISLAND_OFFSET_PX, y: 0 },
  honshu: { x: 2 * ISLAND_OFFSET_PX, y: ISLAND_OFFSET_PX },
  shikoku: { x: ISLAND_OFFSET_PX, y: ISLAND_OFFSET_PX },
  kyushu: { x: 0, y: 2 * ISLAND_OFFSET_PX },
  okinawa: { x: 0, y: 3 * ISLAND_OFFSET_PX },
};

export const PREFECTURE_TILES: readonly PrefectureTile[] = [
  { code: "01", col: 11, row: 1, colSpan: 3, rowSpan: 2, island: "hokkaido" },
  { code: "02", col: 12, row: 3, colSpan: 2, rowSpan: 1, island: "honshu" },
  { code: "03", col: 13, row: 4, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "04", col: 13, row: 5, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "05", col: 12, row: 4, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "06", col: 12, row: 5, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "07", col: 12, row: 6, colSpan: 2, rowSpan: 1, island: "honshu" },
  { code: "08", col: 13, row: 7, colSpan: 1, rowSpan: 2, island: "honshu" },
  { code: "09", col: 12, row: 7, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "10", col: 11, row: 7, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "11", col: 11, row: 8, colSpan: 2, rowSpan: 1, island: "honshu" },
  { code: "12", col: 13, row: 9, colSpan: 1, rowSpan: 2, island: "honshu" },
  { code: "13", col: 12, row: 9, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "14", col: 12, row: 10, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "15", col: 10, row: 6, colSpan: 2, rowSpan: 1, island: "honshu" },
  { code: "16", col: 9, row: 7, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "17", col: 8, row: 6, colSpan: 1, rowSpan: 2, island: "honshu" },
  { code: "18", col: 8, row: 8, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "19", col: 11, row: 9, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "20", col: 10, row: 7, colSpan: 1, rowSpan: 3, island: "honshu" },
  { code: "21", col: 9, row: 8, colSpan: 1, rowSpan: 2, island: "honshu" },
  { code: "22", col: 10, row: 10, colSpan: 2, rowSpan: 1, island: "honshu" },
  { code: "23", col: 9, row: 10, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "24", col: 8, row: 10, colSpan: 1, rowSpan: 2, island: "honshu" },
  { code: "25", col: 8, row: 9, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "26", col: 7, row: 8, colSpan: 1, rowSpan: 2, island: "honshu" },
  { code: "27", col: 6, row: 10, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "28", col: 6, row: 8, colSpan: 1, rowSpan: 2, island: "honshu" },
  { code: "29", col: 7, row: 10, colSpan: 1, rowSpan: 2, island: "honshu" },
  { code: "30", col: 6, row: 11, colSpan: 1, rowSpan: 2, island: "honshu" },
  { code: "31", col: 5, row: 8, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "32", col: 4, row: 8, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "33", col: 5, row: 9, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "34", col: 4, row: 9, colSpan: 1, rowSpan: 1, island: "honshu" },
  { code: "35", col: 3, row: 8, colSpan: 1, rowSpan: 2, island: "honshu" },
  { code: "36", col: 5, row: 12, colSpan: 1, rowSpan: 1, island: "shikoku" },
  { code: "37", col: 5, row: 11, colSpan: 1, rowSpan: 1, island: "shikoku" },
  { code: "38", col: 4, row: 11, colSpan: 1, rowSpan: 1, island: "shikoku" },
  { code: "39", col: 4, row: 12, colSpan: 1, rowSpan: 1, island: "shikoku" },
  { code: "40", col: 2, row: 10, colSpan: 2, rowSpan: 1, island: "kyushu" },
  { code: "41", col: 1, row: 10, colSpan: 1, rowSpan: 1, island: "kyushu" },
  { code: "42", col: 1, row: 11, colSpan: 1, rowSpan: 1, island: "kyushu" },
  { code: "43", col: 2, row: 11, colSpan: 1, rowSpan: 1, island: "kyushu" },
  { code: "44", col: 3, row: 11, colSpan: 1, rowSpan: 1, island: "kyushu" },
  { code: "45", col: 3, row: 12, colSpan: 1, rowSpan: 1, island: "kyushu" },
  { code: "46", col: 1, row: 12, colSpan: 2, rowSpan: 1, island: "kyushu" },
  { code: "47", col: 1, row: 13, colSpan: 1, rowSpan: 1, island: "okinawa" },
];

/** Listing-count thresholds for the colour ramp: bucket n starts at THRESHOLDS[n - 1]. */
export const TILE_THRESHOLDS: readonly number[] = [50, 150, 400, 1000, 2500];

/** Number of colour buckets (one more than the thresholds). */
export const TILE_BUCKET_COUNT = TILE_THRESHOLDS.length + 1;

export function tileBucket(count: number): number {
  return TILE_THRESHOLDS.filter((threshold) => count >= threshold).length;
}

export function islandOffset(island: Island): { x: number; y: number } {
  return ISLAND_OFFSETS[island];
}

export function tileNameSize(name: string, colSpan: number, rowSpan: number): string {
  // Tiles of 4+ cells have room for a large name; single cells step the name down to fit.
  if (colSpan * rowSpan >= 4) return "16px";
  if (colSpan > 1 || name.length <= 7) return "12px";
  if (name.length === 8) return "11px";
  return "10.5px";
}

export interface TileLegendEntry {
  bucket: number;
  label: string;
}

export function tileLegend(): TileLegendEntry[] {
  const format = (n: number) => n.toLocaleString("en-US");
  return Array.from({ length: TILE_BUCKET_COUNT }, (_, bucket) => {
    if (bucket === 0) return { bucket, label: `< ${format(TILE_THRESHOLDS[0])}` };
    return { bucket, label: `${format(TILE_THRESHOLDS[bucket - 1])}+` };
  });
}

/** Pixel rectangle of a tile before the island offset is applied, for overlap checks. */
export function tilePixelRect(tile: PrefectureTile): { x: number; y: number; width: number; height: number } {
  const offset = islandOffset(tile.island);
  return {
    x: (tile.col - 1) * (TILE_WIDTH + TILE_GAP) + offset.x,
    y: (tile.row - 1) * (TILE_HEIGHT + TILE_GAP) + offset.y,
    width: tile.colSpan * TILE_WIDTH + (tile.colSpan - 1) * TILE_GAP,
    height: tile.rowSpan * TILE_HEIGHT + (tile.rowSpan - 1) * TILE_GAP,
  };
}
