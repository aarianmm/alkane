import type { Atom } from "../graph/types";

export type StyleId = "displayed" | "structural" | "skeletal";

export interface ChildAngleContext {
  /** Direction from this atom's parent to this atom. Null only at the root. */
  angleIn: number | null;
  /** This atom's own parent's angleIn — needed only by skeletal's turn alternation. */
  grandAngleIn: number | null;
  /** 1..valency-1 for a non-root atom, 1..valency at the root (slot 0, the parent bond, is implicit). */
  slot: number;
  valency: number;
}

export interface LabelSpec {
  /** Element symbol, e.g. "C", "O", "Cl". */
  main: string;
  /** Bundled hydrogen count shown as a subscript. 0 = no subscript. */
  hydrogenCount: number;
  /** H3C- vs -CH3; which side of `main` the bundled hydrogens render on. */
  hydrogenSide: "before" | "after";
}

export interface LabelContext {
  /** Implicit hydrogen count for this atom (valency - used bonds), for styles that bundle H into the label. */
  hydrogenCount: number;
  /** Direction from this atom's parent to this atom. Null only at the root. */
  angleIn: number | null;
}

export interface RenderStyle {
  id: StyleId;

  /** Absolute angle for a child occupying `slot`, given the walker's context. */
  childAngle(ctx: ChildAngleContext): number;

  /** What this vertex shows. Null = bare vertex (e.g. a skeletal carbon). */
  label(atom: Atom, ctx: LabelContext): LabelSpec | null;

  /** Whether implicit hydrogens are drawn as their own positioned pseudo-atoms (Displayed only). */
  rendersExplicitHydrogens: boolean;
}
