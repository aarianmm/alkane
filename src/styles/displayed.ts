import type { Atom } from "../graph/types";
import type { ChildAngleContext, LabelSpec, RenderStyle } from "./types";

/**
 * At a non-root atom, slot 1 is always `angleIn` itself — the bond continues
 * dead straight through, which is what makes a chain of carbons render as a
 * horizontal line (the textbook displayed-formula look). Together with the
 * implicit parent bond (always the exact opposite, `angleIn + 180`), that
 * continuation pins a fixed 180°/180° pair of open half-planes on either
 * side of the chain axis. Later slots branch into those halves at +/-90 —
 * dead centre of each half, the only placement that stays equidistant from
 * both the parent bond and the continuation. This is valency-independent:
 * it's about splitting the two fixed halves evenly, not about 360/valency
 * spacing (which would crowd one side and starve the other for any valency
 * other than 4 — nitrogen's branch ended up only 60° from its parent bond
 * before this fix). A divalent atom (O/S, no branch slot at all) reduces to
 * nothing beyond the straight-through slot 1 — an ether bonds straight
 * through, correct for this convention.
 */
function nonRootAngle(angleIn: number, slot: number): number {
  const magnitude = Math.ceil((slot - 1) / 2);
  const sign = slot % 2 === 0 ? 1 : -1;
  return angleIn + sign * magnitude * 90;
}

/**
 * The root has no parent bond to reserve a direction, so it gets one more
 * degree of freedom than a non-root atom: slot 1 opens the chain east, and
 * slot 2 continues it west, so a root that ends up as a middle atom (a
 * second real bond grown off it) still reads as one straight horizontal
 * backbone instead of jogging vertical. Only once both horizontal
 * directions are taken do later slots branch vertically off that axis,
 * reusing the same alternating +/-90-style spacing a non-root atom's
 * branches use.
 */
function rootAngle(slot: number): number {
  if (slot === 1) return 0;
  if (slot === 2) return 180;
  return nonRootAngle(0, slot - 1);
}

function childAngle({ angleIn, slot }: ChildAngleContext): number {
  return angleIn === null ? rootAngle(slot) : nonRootAngle(angleIn, slot);
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
