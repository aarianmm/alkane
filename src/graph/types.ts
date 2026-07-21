/**
 * The molecule graph is the editor's source of truth. The SVG layer only
 * renders it; chemical meaning is never derived from rendered output.
 */

export type Element = string;

export type BondOrder = 1 | 2 | 3;

export interface AtomId {
  id: string;
}

export interface Bond {
  /** Id of the other atom this bond connects to. */
  to: string;
  order: BondOrder;
}

export interface Atom {
  id: string;
  element: Element;
  bonds: Bond[];
  /** Layout position, computed automatically rather than user-placed. */
  position: {
    x: number;
    y: number;
  };
}

export interface MoleculeGraph {
  atoms: Atom[];
}

export function createEmptyGraph(): MoleculeGraph {
  return { atoms: [] };
}
