import { describe, expect, it } from "vitest";
import { createSeedGraph } from "../graph/types";
import { addAtomFromStub } from "../graph/mutations";
import { displayed } from "../styles/displayed";
import { GhostLayer } from "./GhostLayer";

// No DOM/renderer is configured in this project (vitest runs with the "node"
// environment — see vite.config.ts), so these tests call GhostLayer as a
// plain function and inspect the React element tree it returns, the same
// lightweight technique used to keep the rest of this codebase's tests pure.

describe("GhostLayer", () => {
  it("renders nothing when there is no preview graph", () => {
    const graph = createSeedGraph();
    const result = GhostLayer({
      baseGraph: graph,
      basePositions: new Map(),
      baseLabels: new Map(),
      previewGraph: null,
      style: displayed,
    });

    expect(result).toBeNull();
  });

  it("renders nothing when the preview graph has no diff from the base graph", () => {
    const graph = createSeedGraph();
    const result = GhostLayer({
      baseGraph: graph,
      basePositions: new Map(),
      baseLabels: new Map(),
      previewGraph: graph,
      style: displayed,
    });

    expect(result).toBeNull();
  });

  it("renders exactly one ghost bond and one ghost atom for a stub-grow preview", () => {
    const base = createSeedGraph();
    const preview = addAtomFromStub(base, base.rootId, "O", 1);

    const result = GhostLayer({
      baseGraph: base,
      basePositions: new Map(),
      baseLabels: new Map(),
      previewGraph: preview,
      style: displayed,
    });

    expect(result).not.toBeNull();
    expect(result!.props.pointerEvents).toBe("none");
    expect(result!.props.opacity).toBeLessThan(1);

    const children = result!.props.children as unknown[];
    const flat = children.flat();
    expect(flat).toHaveLength(2); // one ghost BondView, one ghost AtomView
    expect((flat[1] as { props: { atom: { id: string } } }).props.atom.id).toBe("1");
  });

  it("renders nothing for a null preview even with a non-empty base graph", () => {
    const base = addAtomFromStub(createSeedGraph(), "0", "C", 1);
    const result = GhostLayer({
      baseGraph: base,
      basePositions: new Map(),
      baseLabels: new Map(),
      previewGraph: undefined,
      style: displayed,
    });

    expect(result).toBeNull();
  });
});
