import type { LabelSpec } from "../styles/types";

/** Estimated glyph widths, SVG user units — deliberately not measured via getBBox, so layout stays pure and deterministic. */
const MAIN_GLYPH_WIDTH = 9;
const SUBSCRIPT_DIGIT_WIDTH = 6;

/** Fixed clearance for a bond that meets a label mostly vertically. */
const LABEL_HALF_HEIGHT = 8;

/** Half the label's estimated rendered width: main symbol, plus a bundled "H" and its subscript digit(s) if any. */
export function labelHalfWidth(label: LabelSpec): number {
  const mainWidth = label.main.length * MAIN_GLYPH_WIDTH;
  const hydrogenWidth = label.hydrogenCount > 0 ? MAIN_GLYPH_WIDTH : 0;
  const subscriptWidth = label.hydrogenCount >= 2 ? String(label.hydrogenCount).length * SUBSCRIPT_DIGIT_WIDTH : 0;
  return (mainWidth + hydrogenWidth + subscriptWidth) / 2;
}

/**
 * How far a bond line should be shortened from an endpoint, given what that
 * endpoint shows and which direction the bond leaves it in. A bare vertex
 * (null label — skeletal carbon) clips nothing. A horizontal-ish bond clips
 * by the label's estimated half-width; a vertical-ish one clips by a fixed
 * half-height, since a wide condensed label like `H3C` only needs to clear
 * text sideways, not above/below.
 */
export function clipDistance(label: LabelSpec | null, directionX: number, directionY: number): number {
  if (!label) return 0;
  return Math.abs(directionX) >= Math.abs(directionY) ? labelHalfWidth(label) : LABEL_HALF_HEIGHT;
}
