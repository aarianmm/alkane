import type { Atom } from "../graph/types";
import type { ChildAngleContext, LabelContext, LabelSpec, RenderStyle } from "./types";
import { toSignedAngle } from "../layout/hydrogens";
import { hydrogenSideFromBonds } from "./labelSide";

/** Every skeletal turn is 60deg, producing the classic 120deg vertex on the 30deg lattice. */
const TURN = 60;

/** Tilt of a direction off the nearest horizontal axis, folded into (-90, 90]. */
function foldTilt(angle: number): number {
  let tilt = toSignedAngle(angle);
  if (tilt > 90) tilt -= 180;
  else if (tilt <= -90) tilt += 180;
  return tilt;
}

/**
 * Which way the slot-1 continuation turns at an atom entered along angleIn:
 * opposite to the turn its parent took (zig-zag, not spiral). At depth 1 —
 * and below a quaternary carbon's straight-through 4th bond, where the parent
 * made no turn — fall back to turning against the bond's tilt off horizontal,
 * which reproduces "turn opposite the root's opening direction" on both the
 * east (-30 -> +60) and west (210 -> -60) chains. A pure-vertical angleIn has
 * no meaningful tilt; both signs are geometrically equivalent, tie-break +1.
 */
function continuationTurnSign(angleIn: number, grandAngleIn: number | null): 1 | -1 {
  if (grandAngleIn !== null) {
    const parentTurn = toSignedAngle(angleIn - grandAngleIn);
    if (parentTurn !== 0) return parentTurn > 0 ? -1 : 1;
  }
  const tilt = foldTilt(angleIn);
  if (tilt === 0 || Math.abs(tilt) === 90) return 1;
  return tilt > 0 ? -1 : 1;
}

/** Completes the design's fixed slot-1 (-30deg) into a full root table: horizontal axis first, then verticals. */
function rootAngle(slot: number): number {
  switch (slot) {
    case 1:
      return -30; // up-right: the first bond already starts the zig
    case 2:
      return 210; // up-left: a root grown into a mid-chain atom stays one continuous zig-zag
    case 3:
      return 90; // straight down: completes the 120/120/120 trivalent star
    default:
      return -90; // straight up: quaternary root's 4th bond
  }
}

function nonRootAngle(angleIn: number, grandAngleIn: number | null, slot: number): number {
  const sign = continuationTurnSign(angleIn, grandAngleIn);
  switch (slot) {
    case 1:
      return angleIn + sign * TURN; // continuation: alternate the turn
    case 2:
      return angleIn - sign * TURN; // branch: the 60deg side continuation didn't take
    default:
      // Quaternary 4th bond: straight through the vertex. (The design doc
      // says "angleIn + 180" here, which is this same bond expressed
      // relative to the parent bond leaving the vertex — literally
      // angleIn + 180 would place the child on top of the parent atom.)
      return angleIn;
  }
}

function childAngle({ angleIn, grandAngleIn, slot }: ChildAngleContext): number {
  return angleIn === null ? rootAngle(slot) : nonRootAngle(angleIn, grandAngleIn, slot);
}

/**
 * Carbon is never labelled — bare vertices everywhere, including chain ends
 * and branch points; a terminal methyl is just a line ending. Heteroatoms get
 * the same bundled-H LabelSpec rendering Structural uses (OH, NH2, Cl).
 */
function label(atom: Atom, ctx: LabelContext): LabelSpec | null {
  if (atom.element === "C") return null;
  return {
    main: atom.element,
    hydrogenCount: ctx.hydrogenCount,
    hydrogenSide: hydrogenSideFromBonds(ctx.bondAngles),
  };
}

export const skeletal: RenderStyle = {
  id: "skeletal",
  childAngle,
  label,
  rendersExplicitHydrogens: false,
};
