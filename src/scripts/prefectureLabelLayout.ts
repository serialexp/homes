/**
 * Layout helpers for the prefecture count labels on the map. Used at build time by
 * generatePrefectureLabels.ts; the app itself only fills in the text.
 */

/**
 * Point to draw a prefecture's label at, from its SVG path data.
 *
 * A prefecture's path can hold outlying islands (Tokyo includes the Ogasawara islands far to the
 * south-east), so the bounding box of the whole path can sit in the sea. Instead take the subpath
 * with the largest bounding box and return its centre.
 *
 * Only absolute M, L and Z commands are supported, which is what the bundled prefecture map uses.
 */
export function labelAnchor(d: string): { x: number; y: number } | null {
  let best: { area: number; x: number; y: number } | null = null;

  for (const subpath of d.split("M")) {
    const numbers = subpath.match(/-?\d+(?:\.\d+)?/g);
    if (!numbers || numbers.length < 2) continue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      const x = Number(numbers[i]);
      const y = Number(numbers[i + 1]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const area = (maxX - minX) * (maxY - minY);
    if (!best || area > best.area) {
      best = { area, x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }
  }

  return best ? { x: best.x, y: best.y } : null;
}

export interface LabelInput {
  id: string;
  /** Anchor point the label belongs to. */
  x: number;
  y: number;
  text: string;
}

export interface PlacedLabel {
  id: string;
  text: string;
  /** Anchor point (the shape the label belongs to). */
  anchorX: number;
  anchorY: number;
  /** Centre of the label as placed. */
  x: number;
  y: number;
  /** True when the label was moved away from its anchor and needs a leader line. */
  moved: boolean;
}

export interface LabelOptions {
  fontSize: number;
  /** Gap kept between label boxes. */
  padding: number;
  /** Distance between search rings. */
  step: number;
  /** Furthest distance from the anchor a label may be moved. */
  maxRadius: number;
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const DIRECTIONS = 12;

/** Estimated box of a label centred on (x, y). Digits are about 0.6em wide, separators 0.3em. */
export function labelBox(text: string, x: number, y: number, fontSize: number): Box {
  let em = 0;
  for (const character of text) em += character === "," || character === "." ? 0.3 : 0.6;
  const halfWidth = (em * fontSize) / 2;
  const halfHeight = fontSize / 2;
  return { left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight };
}

function overlaps(a: Box, b: Box, padding: number): boolean {
  return a.left < b.right + padding && b.left < a.right + padding && a.top < b.bottom + padding && b.top < a.bottom + padding;
}

/**
 * Places labels so they do not overlap. Each label starts on its anchor; if that spot is taken by an
 * earlier label, it moves to the nearest free spot found by searching outward in rings.
 */
export function placeLabels(inputs: LabelInput[], options: LabelOptions): PlacedLabel[] {
  const placedBoxes: Box[] = [];

  return inputs.map(input => {
    const home = labelBox(input.text, input.x, input.y, options.fontSize);
    const isFree = (box: Box) => placedBoxes.every(other => !overlaps(box, other, options.padding));

    const result = (x: number, y: number, moved: boolean): PlacedLabel => ({
      id: input.id,
      text: input.text,
      anchorX: input.x,
      anchorY: input.y,
      x,
      y,
      moved,
    });

    if (isFree(home)) {
      placedBoxes.push(home);
      return result(input.x, input.y, false);
    }

    for (let radius = options.step; radius <= options.maxRadius; radius += options.step) {
      for (let direction = 0; direction < DIRECTIONS; direction++) {
        const angle = (direction * 2 * Math.PI) / DIRECTIONS;
        const x = input.x + radius * Math.cos(angle);
        const y = input.y + radius * Math.sin(angle);
        const box = labelBox(input.text, x, y, options.fontSize);
        if (isFree(box)) {
          placedBoxes.push(box);
          return result(x, y, true);
        }
      }
    }

    // No free spot within range: keep it on its anchor rather than drop it.
    placedBoxes.push(home);
    return result(input.x, input.y, false);
  });
}
