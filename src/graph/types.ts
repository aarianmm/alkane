/**
 * The molecule graph is the editor's source of truth (see
 * Alkane-Implementation-Plan.md). Hydrogen is never a graph node — every
 * supported molecule is fully described by its heavy atoms, with H filled in
 * at serialization time the same way the engine's own
 * ElementGraph.FillImplicitHydrogens does.
 */

export type Element = "C" | "O" | "N" | "S" | "F" | "Cl" | "Br" | "I";

/** Mirrors SpecificationData.cs's PeriodicTable (minus H, which is never placeable here). */
export const PERIODIC_TABLE: Record<Element, { name: string; valency: number }> = {
  C: { name: "Carbon", valency: 4 },
  O: { name: "Oxygen", valency: 2 },
  N: { name: "Nitrogen", valency: 3 },
  S: { name: "Sulphur", valency: 2 },
  F: { name: "Fluorine", valency: 1 },
  Cl: { name: "Chlorine", valency: 1 },
  Br: { name: "Bromine", valency: 1 },
  I: { name: "Iodine", valency: 1 },
};

export type BondOrder = 1 | 2 | 3;

export interface Bond {
  to: string;
  order: BondOrder;
}

export interface Atom {
  id: string;
  element: Element;
  bonds: Bond[];
  /**
   * The atom this one grew from. Undefined only for the root/seed atom.
   * Distinguishes "the bond that grew this atom" from a later ring-closing
   * bond between two already-existing atoms — both are just entries in
   * `bonds`, but only the parent edge carries placement/layout meaning.
   */
  parentId?: string;
  /**
   * Degrees, the direction from parent to this atom chosen at creation time.
   * Undefined only for the root/seed atom. This is what makes layout
   * incremental — see layoutFromRoot in the layout module.
   */
  angleFromParent?: number;
}

export interface MoleculeGraph {
  atoms: Atom[];
  rootId: string;
  /** Monotonic counter for new atom ids — never reused, so deletions can't cause id collisions. */
  nextId: number;
}

export function createSeedGraph(): MoleculeGraph {
  return {
    atoms: [{ id: "0", element: "C", bonds: [] }],
    rootId: "0",
    nextId: 1,
  };
}
