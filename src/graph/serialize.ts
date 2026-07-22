import type { MoleculeGraph } from "./types";

/** Wire format for OrganicNamer.Api's POST /api/name (see Models.cs). */
export interface ApiBondInput {
  to: number;
  order: number;
}

export interface ApiAtomInput {
  element: string;
  bonds: ApiBondInput[];
}

/**
 * Converts the editor's id-based graph into the index-based atom array the
 * naming API expects. Hydrogen is deliberately not filled in here — the
 * engine already does this itself via ElementGraph.FillImplicitHydrogens.
 */
export function graphToApiAtoms(graph: MoleculeGraph): ApiAtomInput[] {
  const indexById = new Map(graph.atoms.map((atom, index) => [atom.id, index]));

  return graph.atoms.map((atom) => ({
    element: atom.element,
    bonds: atom.bonds.map((bond) => ({
      to: indexById.get(bond.to)!,
      order: bond.order,
    })),
  }));
}
