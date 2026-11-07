import { describe, expect, it } from "vitest";
import { areas } from "../data/propertyData.js";
import {
  PREFECTURE_TILES,
  tileBucket,
  tileLegend,
  tileNameSize,
  tilePixelRect,
} from "./prefectureTiles.js";

describe("PREFECTURE_TILES", () => {
  it("has exactly one tile for each prefecture in the area data", () => {
    const provinceCodes = Object.values(areas).flatMap((area) => Object.keys(area.provinces)).sort();
    const tileCodes = PREFECTURE_TILES.map((tile) => tile.code).sort();
    expect(tileCodes).toEqual(provinceCodes);
    expect(new Set(tileCodes).size).toBe(47);
  });

  it("keeps every tile inside the 13 x 13 grid", () => {
    for (const tile of PREFECTURE_TILES) {
      expect(tile.col).toBeGreaterThanOrEqual(1);
      expect(tile.row).toBeGreaterThanOrEqual(1);
      expect(tile.col + tile.colSpan - 1).toBeLessThanOrEqual(13);
      expect(tile.row + tile.rowSpan - 1).toBeLessThanOrEqual(13);
    }
  });

  it("draws no two tiles over each other, after island offsets", () => {
    const rects = PREFECTURE_TILES.map((tile) => ({ code: tile.code, ...tilePixelRect(tile) }));
    const overlaps: string[] = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const intersect =
          a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        if (intersect) overlaps.push(`${a.code}/${b.code}`);
      }
    }
    expect(overlaps).toEqual([]);
  });
});

describe("tileBucket", () => {
  it("moves up a bucket at each legend threshold", () => {
    expect(tileBucket(0)).toBe(0);
    expect(tileBucket(49)).toBe(0);
    expect(tileBucket(50)).toBe(1);
    expect(tileBucket(149)).toBe(1);
    expect(tileBucket(150)).toBe(2);
    expect(tileBucket(399)).toBe(2);
    expect(tileBucket(400)).toBe(3);
    expect(tileBucket(999)).toBe(3);
    expect(tileBucket(1000)).toBe(4);
    expect(tileBucket(2499)).toBe(4);
    expect(tileBucket(2500)).toBe(5);
  });
});

describe("tileLegend", () => {
  it("labels each bucket with its lower bound", () => {
    expect(tileLegend().map((entry) => entry.label)).toEqual([
      "< 50",
      "50+",
      "150+",
      "400+",
      "1,000+",
      "2,500+",
    ]);
  });
});

describe("tileNameSize", () => {
  it("gives large tiles the big name size and steps long names down on single cells", () => {
    expect(tileNameSize("Hokkaido", 3, 2)).toBe("16px");
    expect(tileNameSize("Tokyo", 1, 1)).toBe("12px");
    expect(tileNameSize("Kanagawa", 1, 1)).toBe("11px");
    expect(tileNameSize("Fukushima", 1, 1)).toBe("10.5px");
  });
});
