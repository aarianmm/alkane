import type { MoleculeGraph } from "../graph/types";
import { graphToApiAtoms } from "../graph/serialize";

export interface NameResult {
  /** May contain more than one name when a molecule has equivalent naming options. */
  names: string[];
}

export class NamingApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NamingApiError";
  }
}

interface ErrorBody {
  message?: string;
}

/** Posts the graph to OrganicNamer.Api's POST /api/name and returns the generated name(s). */
export async function nameMolecule(graph: MoleculeGraph, signal?: AbortSignal): Promise<NameResult> {
  const response = await fetch("/api/name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ atoms: graphToApiAtoms(graph) }),
    signal,
  });

  if (!response.ok) {
    const body: ErrorBody | null = await response.json().catch(() => null);
    throw new NamingApiError(body?.message ?? `Naming API request failed (${response.status})`);
  }

  return (await response.json()) as NameResult;
}
