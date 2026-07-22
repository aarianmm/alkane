import { useEffect, useState } from "react";
import type { MoleculeGraph } from "../graph/types";
import { nameMolecule } from "./namingApi";

export type NameStatus =
  | { status: "loading" }
  | { status: "success"; name: string }
  | { status: "error"; message: string };

const DEBOUNCE_MS = 300;

/** Names the graph on the naming API, debounced so a burst of edits (e.g. clicking through stubs) only fires one request. */
export function useMoleculeName(graph: MoleculeGraph): NameStatus {
  const [state, setState] = useState<NameStatus>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    const timer = setTimeout(() => {
      nameMolecule(graph, controller.signal)
        .then((result) => {
          setState({ status: "success", name: result.names.join(" / ") });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : "Could not reach the naming service";
          setState({ status: "error", message });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [graph]);

  return state;
}
