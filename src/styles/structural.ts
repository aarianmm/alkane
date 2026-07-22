import type { Atom } from "../graph/types";
import type { LabelContext, LabelSpec, RenderStyle } from "./types";
import { displayed } from "./displayed";
import { hydrogenSideFromBonds } from "./labelSide";

/**
 * Structural formulae: every atom carries its implicit hydrogens bundled into
 * its label as a subscript (H3C-CH2-CH3), no hydrogen is ever drawn as its
 * own vertex, and heavy-atom geometry is exactly Displayed's — same straight
 * chains, same perpendicular branches, same straight-through ethers.
 */
function label(atom: Atom, ctx: LabelContext): LabelSpec {
  return {
    main: atom.element,
    hydrogenCount: ctx.hydrogenCount,
    hydrogenSide: hydrogenSideFromBonds(ctx.bondAngles),
  };
}

export const structural: RenderStyle = {
  id: "structural",
  // The heavy-atom angle rule is deliberately shared with Displayed — the two
  // styles differ only in how hydrogen is presented.
  childAngle: displayed.childAngle,
  label,
  rendersExplicitHydrogens: false,
};
