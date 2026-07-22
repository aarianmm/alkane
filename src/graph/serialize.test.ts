import { describe, expect, it } from "vitest";
import { createSeedGraph } from "./types";
import { addAtomFromStub, closeRingBond, setBondOrder } from "./mutations";
import { graphToApiAtoms } from "./serialize";

describe("graphToApiAtoms", () => {
  it("remaps string ids to array indexes", () => {
    // Ethanol's heavy-atom skeleton: C-C-O. Compare against
    // Organic-Namer-Engine/examples/ethanol.json, whose C-C-O backbone is
    // atoms 0/1/7 with the rest filled by implicit H the same way the API does.
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, 0, "C", 1); // "1"
    graph = addAtomFromStub(graph, "1", 0, "O", 1); // "2"

    expect(graphToApiAtoms(graph)).toEqual([
      { element: "C", bonds: [{ to: 1, order: 1 }] },
      { element: "C", bonds: [{ to: 0, order: 1 }, { to: 2, order: 1 }] },
      { element: "O", bonds: [{ to: 1, order: 1 }] },
    ]);
  });

  it("keeps bonds symmetric on both sides, matching the engine's own example format", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, 0, "C", 2); // C=C

    const atoms = graphToApiAtoms(graph);
    expect(atoms[0].bonds).toEqual([{ to: 1, order: 2 }]);
    expect(atoms[1].bonds).toEqual([{ to: 0, order: 2 }]);
  });

  it("round-trips a ring (benzene's carbon skeleton)", () => {
    let graph = createSeedGraph();
    for (let i = 0; i < 5; i++) {
      const parent = i === 0 ? graph.rootId : String(i);
      graph = addAtomFromStub(graph, parent, 0, "C", 1);
    }
    graph = closeRingBond(graph, "5", graph.rootId, 2);
    // Alternate 1,2,1,2,1,2 around the ring (Kekulé benzene).
    graph = setBondOrder(graph, "1", "2", 2);
    graph = setBondOrder(graph, "3", "4", 2);

    const atoms = graphToApiAtoms(graph);
    expect(atoms).toHaveLength(6);
    // Every ring atom should have exactly 2 bonds, orders summing to 3 (one single, one double).
    for (const atom of atoms) {
      expect(atom.bonds).toHaveLength(2);
      expect(atom.bonds[0].order + atom.bonds[1].order).toBe(3);
    }
  });
});
