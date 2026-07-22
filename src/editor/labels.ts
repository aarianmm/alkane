import type { Atom } from "../graph/types";

/**
 * Heteroatoms are always labelled; carbon is labelled only at chain ends,
 * branch points (3+ heavy neighbours) and the lone seed atom — a plain
 * 2-neighbour backbone carbon renders as a bare vertex where the bond lines
 * meet. This is ChemDraw/Ketcher's ordinary default look (see
 * Alkane-Implementation-Plan.md), not full skeletal (which hides all carbons).
 */
export function showsAtomLabel(atom: Atom): boolean {
  if (atom.element !== "C") return true;
  return atom.bonds.length !== 2;
}
