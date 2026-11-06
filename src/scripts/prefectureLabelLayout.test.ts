import { describe, expect, it } from "vitest";
import { labelAnchor, labelBox, placeLabels, type LabelInput } from "./prefectureLabelLayout.js";

const options = { fontSize: 34, padding: 4, step: 20, maxRadius: 200 };

function boxesOverlap(a: ReturnType<typeof labelBox>, b: ReturnType<typeof labelBox>, padding: number) {
  return a.left < b.right + padding && b.left < a.right + padding && a.top < b.bottom + padding && b.top < a.bottom + padding;
}

describe("labelAnchor", () => {
  it("uses the centre of a single subpath", () => {
    expect(labelAnchor("M0,0L100,0L100,100L0,100Z")).toEqual({ x: 50, y: 50 });
  });

  it("uses the largest subpath, not the bounding box of the whole path", () => {
    // Mainland square at 0..100, outlying island at 1000..1010.
    const d = "M0,0L100,0L100,100L0,100ZM1000,1000L1010,1000L1010,1010L1000,1010Z";
    expect(labelAnchor(d)).toEqual({ x: 50, y: 50 });
  });

  it("picks the largest subpath even when it comes first or last", () => {
    const small = "M500,500L505,500L505,505L500,505Z";
    const large = "M0,0L40,0L40,20L0,20Z";
    expect(labelAnchor(`${large}${small}`)).toEqual({ x: 20, y: 10 });
    expect(labelAnchor(`${small}${large}`)).toEqual({ x: 20, y: 10 });
  });

  it("handles decimal coordinates", () => {
    expect(labelAnchor("M637.55,580.81L637.28,581.17L637.06,580.78Z")).toEqual({
      x: (637.06 + 637.55) / 2,
      y: (580.78 + 581.17) / 2,
    });
  });

  it("returns null when there are no coordinates", () => {
    expect(labelAnchor("")).toBeNull();
    expect(labelAnchor("MZ")).toBeNull();
  });
});

describe("labelBox", () => {
  it("is wider for longer text", () => {
    const short = labelBox("100", 0, 0, 34);
    const long = labelBox("1,000,000", 0, 0, 34);
    expect(long.right - long.left).toBeGreaterThan(short.right - short.left);
  });

  it("is centred on the given point", () => {
    const box = labelBox("12", 50, 80, 34);
    expect((box.left + box.right) / 2).toBe(50);
    expect((box.top + box.bottom) / 2).toBe(80);
  });
});

describe("placeLabels", () => {
  it("keeps isolated labels on their anchors", () => {
    const inputs: LabelInput[] = [
      { id: "01", x: 100, y: 100, text: "137" },
      { id: "02", x: 400, y: 400, text: "274" },
    ];
    const placed = placeLabels(inputs, options);
    expect(placed.map(p => [p.x, p.y, p.moved])).toEqual([
      [100, 100, false],
      [400, 400, false],
    ]);
  });

  it("moves a label that would overlap an earlier one, and keeps the boxes apart", () => {
    const inputs: LabelInput[] = [
      { id: "08", x: 300, y: 300, text: "1,234" },
      { id: "09", x: 300, y: 300, text: "5,678" },
    ];
    const placed = placeLabels(inputs, options);

    expect(placed[0].moved).toBe(false);
    expect(placed[1].moved).toBe(true);
    expect(placed[1].anchorX).toBe(300);
    expect(placed[1].anchorY).toBe(300);

    const first = labelBox(placed[0].text, placed[0].x, placed[0].y, options.fontSize);
    const second = labelBox(placed[1].text, placed[1].x, placed[1].y, options.fontSize);
    expect(boxesOverlap(first, second, options.padding)).toBe(false);
  });

  it("is deterministic for the same input", () => {
    const inputs: LabelInput[] = Array.from({ length: 6 }, (_, i) => ({ id: String(i), x: 200, y: 200, text: "9,999" }));
    expect(placeLabels(inputs, options)).toEqual(placeLabels(inputs, options));
  });

  it("keeps a label on its anchor when no free spot exists in range", () => {
    const crowded: LabelInput[] = Array.from({ length: 3 }, (_, i) => ({ id: String(i), x: 0, y: 0, text: "9" }));
    const placed = placeLabels(crowded, { fontSize: 34, padding: 4, step: 20, maxRadius: 0 });
    expect(placed.every(p => !p.moved && p.x === 0 && p.y === 0)).toBe(true);
  });
});
