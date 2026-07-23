import { describe, expect, it } from "vitest";
import { createSeedGraph } from "./types";
import { addAtomFromStub, addRing, closeRingBond, setBondOrder } from "./mutations";
import {
  bondOrderBetween,
  canInsertRing,
  findRing,
  hasRing,
  isAromaticRing,
  isRingClosureLegal,
  openSlotCount,
  pathBetween,
  ringBondKeys,
} from "./queries";

describe("openSlotCount", () => {
  it("reflects nominal valency minus bonds used", () => {
    let graph = createSeedGraph();
    expect(openSlotCount(graph.atoms[0])).toBe(4);

    graph = addAtomFromStub(graph, graph.rootId, "O", 2); // double bond, e.g. a ketone
    expect(openSlotCount(graph.atoms[0])).toBe(2);
  });

  it("floors at zero rather than going negative", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "N", 1);
    graph = addAtomFromStub(graph, "1", "O", 2);
    graph = addAtomFromStub(graph, "1", "O", 2); // nitrogen now over nominal valency

    const nitrogen = graph.atoms.find((a) => a.id === "1")!;
    expect(openSlotCount(nitrogen)).toBe(0);
  });
});

describe("bondOrderBetween", () => {
  it("finds the order regardless of which side is queried", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "O", 1);
    graph = setBondOrder(graph, graph.rootId, "1", 2);

    expect(bondOrderBetween(graph, graph.rootId, "1")).toBe(2);
    expect(bondOrderBetween(graph, "1", graph.rootId)).toBe(2);
  });

  it("returns undefined when there is no such bond", () => {
    const graph = createSeedGraph();
    expect(bondOrderBetween(graph, graph.rootId, "missing")).toBeUndefined();
  });
});

describe("hasRing", () => {
  it("is false for a plain chain", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1);
    graph = addAtomFromStub(graph, "1", "C", 1);
    expect(hasRing(graph)).toBe(false);
  });

  it("is true once a ring bond closes the loop", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1);
    graph = addAtomFromStub(graph, "1", "C", 1);
    graph = closeRingBond(graph, "2", graph.rootId, 1);
    expect(hasRing(graph)).toBe(true);
  });
});

describe("pathBetween", () => {
  it("finds the path through a branched tree", () => {
    // seed - 1 - 2
    //          \- 3
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1);
    graph = addAtomFromStub(graph, "1", "C", 1);
    graph = addAtomFromStub(graph, "1", "C", 1);

    expect(pathBetween(graph, graph.rootId, "2")).toEqual([graph.rootId, "1", "2"]);
    expect(pathBetween(graph, "2", "3")).toEqual(["2", "1", "3"]);
  });
});

describe("isRingClosureLegal", () => {
  function carbonChain(length: number) {
    let graph = createSeedGraph();
    for (let i = 0; i < length - 1; i++) {
      const parent = i === 0 ? graph.rootId : String(i);
      graph = addAtomFromStub(graph, parent, "C", 1);
    }
    return graph;
  }

  it("allows closing a 6-carbon chain into a hexagon", () => {
    const graph = carbonChain(6);
    expect(isRingClosureLegal(graph, graph.rootId, "5")).toBe(true);
  });

  it("rejects atoms that are already bonded (no 2-membered ring)", () => {
    const graph = carbonChain(2);
    expect(isRingClosureLegal(graph, graph.rootId, "1")).toBe(false);
  });

  it("rejects a ring larger than 10", () => {
    const graph = carbonChain(11);
    expect(isRingClosureLegal(graph, graph.rootId, "10")).toBe(false);
  });

  it("rejects a path through a heteroatom", () => {
    let graph = carbonChain(5);
    graph = addAtomFromStub(graph, "4", "O", 1); // heteroatom breaks the ring path
    expect(isRingClosureLegal(graph, graph.rootId, "5")).toBe(false);
  });

  it("rejects forming a second ring", () => {
    let graph = carbonChain(6);
    graph = closeRingBond(graph, graph.rootId, "5", 1);
    graph = addAtomFromStub(graph, "5", "C", 1); // "6"
    graph = addAtomFromStub(graph, "6", "C", 1); // "7"
    expect(isRingClosureLegal(graph, "1", "7")).toBe(false);
  });
});

describe("findRing", () => {
  it("is null for a plain chain", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1);
    expect(findRing(graph)).toBeNull();
  });

  it("returns every ring atom exactly once, starting from the anchor nearest the root", () => {
    const graph = addRing(createSeedGraph(), "0", 6, false);
    const ring = findRing(graph)!;

    expect(ring).toHaveLength(6);
    expect(new Set(ring).size).toBe(6);
    expect(ring[0]).toBe("0"); // the seed is both the root and the anchor

    // Every consecutive pair (wrapping) is actually bonded.
    for (let i = 0; i < ring.length; i++) {
      expect(bondOrderBetween(graph, ring[i], ring[(i + 1) % ring.length])).toBeDefined();
    }
  });

  it("starts from the anchor, not the root, when the ring hangs off a chain", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"
    graph = addRing(graph, "1", 5, false);

    expect(findRing(graph)![0]).toBe("1");
  });
});

describe("ringBondKeys", () => {
  it("keys every ring edge, including the closing one", () => {
    const graph = addRing(createSeedGraph(), "0", 4, false);
    const ring = findRing(graph)!;
    const keys = ringBondKeys(ring);

    expect(keys.size).toBe(4);
    for (let i = 0; i < ring.length; i++) {
      const [a, b] = [ring[i], ring[(i + 1) % ring.length]].sort((x, y) => Number(x) - Number(y));
      expect(keys.has(`${a}-${b}`)).toBe(true);
    }
  });
});

describe("isAromaticRing", () => {
  it("is true for a Kekule-alternating 6-ring", () => {
    const graph = addRing(createSeedGraph(), "0", 6, true);
    expect(isAromaticRing(graph, findRing(graph)!)).toBe(true);
  });

  it("is false for an all-single 6-ring (cyclohexane)", () => {
    const graph = addRing(createSeedGraph(), "0", 6, false);
    expect(isAromaticRing(graph, findRing(graph)!)).toBe(false);
  });

  it("is false for a 5-ring even if alternating", () => {
    let graph = createSeedGraph();
    for (let i = 0; i < 4; i++) {
      const parent = i === 0 ? graph.rootId : String(i);
      graph = addAtomFromStub(graph, parent, "C", i % 2 === 0 ? 2 : 1);
    }
    graph = closeRingBond(graph, "4", graph.rootId, 1);
    expect(isAromaticRing(graph, findRing(graph)!)).toBe(false);
  });

  it("is false once one ring bond is dropped back to single (partial Kekule)", () => {
    const graph = addRing(createSeedGraph(), "0", 6, true);
    const ring = findRing(graph)!;
    const downgraded = setBondOrder(graph, ring[0], ring[1], 1);
    expect(isAromaticRing(downgraded, ring)).toBe(false);
  });
});

describe("canInsertRing", () => {
  it("allows a plain ring through the fresh seed", () => {
    expect(canInsertRing(createSeedGraph(), "0", false)).toBe(true);
  });

  it("requires 3 open slots for an aromatic ring but only 2 for a plain one", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1);
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // root: 2 open slots left

    expect(canInsertRing(graph, graph.rootId, false)).toBe(true);
    expect(canInsertRing(graph, graph.rootId, true)).toBe(false);
  });

  it("rejects a non-carbon anchor", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "O", 1);
    expect(canInsertRing(graph, "1", false)).toBe(false);
  });

  it("rejects once a ring already exists", () => {
    const graph = addRing(createSeedGraph(), "0", 6, false);
    const ring = findRing(graph)!;
    expect(canInsertRing(graph, ring[1], false)).toBe(false);
  });
});
