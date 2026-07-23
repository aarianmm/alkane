import type { Point } from "./geometry";

/** Direction (degrees, SVG y-down) from one point to another. */
export function angleBetween(from: Point, to: Point): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function pointAt(origin: Point, angleDegrees: number, distance: number): Point {
  const radians = (angleDegrees * Math.PI) / 180;
  return { x: origin.x + distance * Math.cos(radians), y: origin.y + distance * Math.sin(radians) };
}

/** Circumradius of a regular n-gon whose edge length is `bondLength` — every ring bond, including the closing one, renders at exactly `bondLength`. */
export function ringCircumradius(size: number, bondLength: number): number {
  return bondLength / (2 * Math.sin(Math.PI / size));
}

/**
 * Direction from the anchor toward the ring's center: the bisector of the
 * widest angular gap among the anchor's already-fixed bond directions (its
 * parent bond, if it has one), so the ring always swings away from whatever
 * is already drawn. With no fixed bonds at all (a bare seed atom), defaults
 * to straight down (90 in SVG y-down), the classic apex-at-top hexagon.
 */
export function ringCenterDirection(fixedAngles: number[]): number {
  if (fixedAngles.length === 0) return 90;
  if (fixedAngles.length === 1) return fixedAngles[0] + 180;

  const normalized = fixedAngles.map((a) => ((a % 360) + 360) % 360).sort((a, b) => a - b);
  let bestGapStart = normalized[0];
  let bestGapSize = -Infinity;

  for (let i = 0; i < normalized.length; i++) {
    const start = normalized[i];
    const wrap = i === normalized.length - 1 ? 360 : 0;
    const end = normalized[(i + 1) % normalized.length] + wrap;
    const gap = end - start;
    if (gap > bestGapSize) {
      bestGapSize = gap;
      bestGapStart = start;
    }
  }

  return bestGapStart + bestGapSize / 2;
}

/**
 * Positions of every ring atom, in cycle order starting at the anchor
 * (index 0 lands exactly on `anchor`), given the direction from the anchor
 * toward the ring's center.
 */
export function ringVertexPositions(
  anchor: Point,
  centerDirection: number,
  size: number,
  bondLength: number,
): Point[] {
  const radius = ringCircumradius(size, bondLength);
  const center = pointAt(anchor, centerDirection, radius);
  const anchorAngleFromCenter = centerDirection + 180;
  const step = 360 / size;

  return Array.from({ length: size }, (_, k) => pointAt(center, anchorAngleFromCenter + k * step, radius));
}

/**
 * The outward direction at a ring vertex — away from the ring — given the
 * two bond angles leaving it toward its ring neighbors. Those two directions
 * are always less than 180deg apart (the interior angle of any convex
 * polygon), so their vector-mean bisector unambiguously points inward
 * toward the center; outward is the reverse.
 */
export function ringOutwardAngle(neighborAngleA: number, neighborAngleB: number): number {
  const a = (neighborAngleA * Math.PI) / 180;
  const b = (neighborAngleB * Math.PI) / 180;
  const inward = Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
  return (inward * 180) / Math.PI + 180;
}

/** How far a ring atom's fan of substituent slots spreads either side of the outward radial. Safe for every supported ring size (3-10): even a triangle's 60deg interior angle leaves its ring bonds ~120deg from outward, well clear of this fan. */
const RING_SUBSTITUENT_FAN = 45;

/**
 * Angle for a ring atom's `slot`-th non-ring attachment (H or a grown
 * substituent) — a symmetric fan about the outward radial, standing in for
 * the chain styles' `childAngle` rule, which doesn't apply to ring vertices
 * (see Cyclic-Ring-Plan.md, "Override 2"). `slotCount` is always 0, 1, or 2
 * for the supported element set (valency <= 4, minus the 2 ring-bond
 * directions).
 */
export function ringSubstituentAngle(outward: number, slot: number, slotCount: number): number {
  if (slotCount <= 1) return outward;
  return slot === 1 ? outward - RING_SUBSTITUENT_FAN : outward + RING_SUBSTITUENT_FAN;
}
