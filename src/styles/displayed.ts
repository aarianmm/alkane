import type { Atom } from "../graph/types";
import type { ChildAngleContext, LabelSpec, RenderStyle } from "./types";

/**
 * At a non-root atom, slot 1 is always `angleIn` itself — the bond continues
 * dead straight through, which is what makes a chain of carbons render as a
 * horizontal line (the textbook displayed-formula look). Later slots
 * alternate outward from that continuation axis at multiples of 360/valency,
 * which for carbon gives the familiar angleIn +/- 90 branch pair, and for a
 * divalent atom (O/S, only one non-parent slot) reduces to nothing beyond
 * the straight-through slot 1 — so an ether bonds straight through, correct
 * for this convention.
 */
function nonRootAngle(angleIn: number, slot: number, valency: number): number {
  const step = 360 / valency;
  const magnitude = Math.ceil((slot - 1) / 2);
  const sign = slot % 2 === 0 ? 1 : -1;
  return angleIn + sign * magnitude * step;
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
function rootAngle(slot: number, valency: number): number {
  if (slot === 1) return 0;
  if (slot === 2) return 180;
  return nonRootAngle(0, slot - 1, valency);
}

function childAngle({ angleIn, slot, valency }: ChildAngleContext): number {
  return angleIn === null ? rootAngle(slot, valency) : nonRootAngle(angleIn, slot, valency);
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
