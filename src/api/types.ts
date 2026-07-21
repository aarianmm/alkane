/**
 * Wire format for the Organic-Namer-Engine API. Bonds reference atoms by
 * array index, not by the editor's internal atom ids, so the graph must be
 * converted before it is sent — see graph/serialize.ts.
 */

export type SpecificationSet = "AllGroups" | "Hydrocarbons" | "Alkanes";

export interface ApiBondInput {
  to: number;
  order: number;
}

export interface ApiAtomInput {
  element: string;
  bonds: ApiBondInput[];
}

export interface MoleculeRequest {
  atoms: ApiAtomInput[];
  specificationSet?: SpecificationSet;
}

export interface MoleculeResponse {
  names: string[];
}

export interface ApiErrorResponse {
  error: string;
  message: string;
}
