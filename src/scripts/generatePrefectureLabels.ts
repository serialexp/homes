/**
 * Writes the prefecture count labels into the map SVG.
 *
 * Each prefecture gets an empty <text class="pref-count" data-code="NN"> at a position chosen here, so the
 * app only has to fill in the numbers. Crowded labels are moved out and joined to their prefecture with a
 * leader line. The group replaces any previous one, so the script can be re-run after the map changes.
 *
 * Usage (dry run prints a summary):   node --import tsx src/scripts/generatePrefectureLabels.ts [svg]
 *                                     node --import tsx src/scripts/generatePrefectureLabels.ts [svg] --write
 */
import { readFileSync, writeFileSync } from "node:fs";
import { labelAnchor, placeLabels, type LabelInput } from "./prefectureLabelLayout.js";

const DEFAULT_SVG = "public/japan-prefectures.svg";
// Font size in the map's own units (the viewBox is 1200 wide).
const LABEL_FONT_SIZE = 16;
// Every label is sized as the widest realistic count so positions do not depend on the data.
const SIZING_TEXT = "99,999";
const PLACEMENT = { fontSize: LABEL_FONT_SIZE, padding: 1, step: 8, maxRadius: 160 };
const GROUP_PATTERN = /<g id="pref-counts"[\s\S]*?<\/g>\n?/;

function buildGroup(placed: ReturnType<typeof placeLabels>): string {
  const leaders = placed
    .filter(label => label.moved)
    .map(label => `M${label.anchorX.toFixed(1)},${label.anchorY.toFixed(1)}L${label.x.toFixed(1)},${label.y.toFixed(1)}`);
  const lines = [
    `<g id="pref-counts" font-size="${LABEL_FONT_SIZE}" pointer-events="none">`,
    leaders.length > 0
      ? `<path class="pref-leader" fill="none" stroke="#1d2b28" stroke-width="1" stroke-opacity="0.6" d="${leaders.join("")}"/>`
      : "",
    ...placed.map(
      label =>
        `<text class="pref-count" data-code="${label.id}" x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central"></text>`,
    ),
    "</g>",
  ];
  return lines.filter(line => line !== "").join("\n") + "\n";
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const path = args.find(arg => !arg.startsWith("--")) ?? DEFAULT_SVG;
  const svg = readFileSync(path, "utf8");

  const inputs: LabelInput[] = [];
  for (const match of svg.matchAll(/<path[^>]*data-code="(\d\d)"[^>]*\sd="([^"]*)"/g)) {
    const anchor = labelAnchor(match[2]);
    if (!anchor) throw new Error(`No anchor for prefecture ${match[1]}`);
    inputs.push({ id: match[1], x: anchor.x, y: anchor.y, text: SIZING_TEXT });
  }
  if (inputs.length !== 47) throw new Error(`Expected 47 prefectures, found ${inputs.length}`);

  const placed = placeLabels(inputs, PLACEMENT);
  const moved = placed.filter(label => label.moved);
  console.log(`${placed.length} labels, ${moved.length} moved with leader lines`);
  for (const label of moved) {
    console.log(`  ${label.id} moved ${Math.round(Math.hypot(label.x - label.anchorX, label.y - label.anchorY))} units`);
  }

  if (!write) {
    console.log("Dry run; pass --write to update the SVG.");
    return;
  }

  const group = buildGroup(placed);
  const withoutOld = GROUP_PATTERN.test(svg) ? svg.replace(GROUP_PATTERN, "") : svg;
  const closing = withoutOld.lastIndexOf("</svg>");
  if (closing === -1) throw new Error("No </svg> found");
  writeFileSync(path, withoutOld.slice(0, closing) + group + withoutOld.slice(closing));
  console.log(`Wrote ${path}`);
}

main();
