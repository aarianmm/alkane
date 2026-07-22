import type { Atom } from "../graph/types";
import type { ChildAngleContext, LabelSpec, RenderStyle } from "./types";

/**
 * Slots spaced 360/valency apart. At the root, slot 1 sits due east (0°) so
 * chains grow rightward, and later slots continue evenly around the circle.
 * At a non-root atom, slot 1 is always `angleIn` itself — the bond continues
 * dead straight through, which is what makes a chain of carbons render as a
 * horizontal line (the textbook displayed-formula look). Later slots
 * alternate outward from that continuation axis at multiples of the same
 * step, which for carbon (step 90) gives the familiar angleIn +/- 90 branch
 * pair, and for a divalent atom (O/S, only one non-parent slot) reduces to
 * nothing beyond the straight-through slot 1 — so an ether bonds straight
 * through, correct for this convention.
 */
function childAngle({ angleIn, slot, valency }: ChildAngleContext): number {
  const step = 360 / valency;

  if (angleIn === null) {
    return (slot - 1) * step;
  }

  const magnitude = Math.ceil((slot - 1) / 2);
  const sign = slot % 2 === 0 ? 1 : -1;
  return angleIn + sign * magnitude * step;
}

/** Every atom (and every pseudo-atom hydrogen) is always labelled with its own symbol, no bundling. */
function label(atom: Atom): LabelSpec {
  return { main: atom.element, hydrogenCount: 0, hydrogenSide: "after" };
}

export const displayed: RenderStyle = {
  id: "displayed",
  childAngle,
  label,
  rendersExplicitHydrogens: true,
};
