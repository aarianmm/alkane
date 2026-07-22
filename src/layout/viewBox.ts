import type { Point } from "./geometry";

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Padding around the molecule's bounding box, covering label width and (later) stub hit-radius. */
const PADDING = 40;

/** Minimum size so a single atom isn't rendered as a zero-area box. */
const MIN_SIZE = 120;

/**
 * Bounding box of every given point (atom positions, and open stub
 * positions so they don't clip at the edge), padded and floored to a
 * minimum size, so the SVG always frames the whole molecule with room to
 * spare — no pan or zoom needed as it grows.
 */
export function computeViewBox(points: Point[]): ViewBox {
  if (points.length === 0) {
    return { x: -MIN_SIZE / 2, y: -MIN_SIZE / 2, width: MIN_SIZE, height: MIN_SIZE };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const width = Math.max(maxX - minX + PADDING * 2, MIN_SIZE);
  const height = Math.max(maxY - minY + PADDING * 2, MIN_SIZE);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}
