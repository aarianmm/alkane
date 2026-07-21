import type { MoleculeGraph } from "./types";
import type { ApiAtomInput } from "../api/types";

/**
 * Converts the editor's id-based graph into the index-based atom array the
 * naming API expects.
 */
export function graphToApiAtoms(graph: MoleculeGraph): ApiAtomInput[] {
  const indexById = new Map(graph.atoms.map((atom, index) => [atom.id, index]));

  return graph.atoms.map((atom) => ({
    element: atom.element,
    bonds: atom.bonds.map((bond) => ({
      to: indexById.get(bond.to) ?? -1,
      order: bond.order,
    })),
  }));
}
