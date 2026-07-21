import type { MoleculeGraph } from "../graph/types";
import { graphToApiAtoms } from "../graph/serialize";
import type {
  ApiErrorResponse,
  MoleculeRequest,
  MoleculeResponse,
  SpecificationSet,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_NAMING_API_URL;

export class NamingApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorResponse,
  ) {
    super(body.message);
    this.name = "NamingApiError";
  }
}

export async function nameMolecule(
  graph: MoleculeGraph,
  specificationSet: SpecificationSet = "AllGroups",
): Promise<MoleculeResponse> {
  const request: MoleculeRequest = {
    atoms: graphToApiAtoms(graph),
    specificationSet,
  };

  const response = await fetch(`${API_BASE_URL}/api/name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as ApiErrorResponse;
    throw new NamingApiError(response.status, errorBody);
  }

  return (await response.json()) as MoleculeResponse;
}
