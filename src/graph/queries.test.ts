import { describe, expect, it } from "vitest";
import { createSeedGraph } from "./types";
import { addAtomFromStub, closeRingBond, setBondOrder } from "./mutations";
import { bondOrderBetween, hasRing, isRingClosureLegal, openSlotCount, pathBetween } from "./queries";

describe("openSlotCount", () => {
  it("reflects nominal valency minus bonds used", () => {
    let graph = createSeedGraph();
    expect(openSlotCount(graph.atoms[0])).toBe(4);

    graph = addAtomFromStub(graph, graph.rootId, 0, "O", 2); // double bond, e.g. a ketone
    expect(openSlotCount(graph.atoms[0])).toBe(2);
  });

  it("floors at zero rather than going negative", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, 0, "N", 1);
    graph = addAtomFromStub(graph, "1", -45, "O", 2);
    graph = addAtomFromStub(graph, "1", 45, "O", 2); // nitrogen now over nominal valency

    const nitrogen = graph.atoms.find((a) => a.id === "1")!;
    expect(openSlotCount(nitrogen)).toBe(0);
  });
});

describe("bondOrderBetween", () => {
  it("finds the order regardless of which side is queried", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, 0, "O", 1);
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
    graph = addAtomFromStub(graph, graph.rootId, 0, "C", 1);
    graph = addAtomFromStub(graph, "1", 0, "C", 1);
    expect(hasRing(graph)).toBe(false);
  });

  it("is true once a ring bond closes the loop", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, 0, "C", 1);
    graph = addAtomFromStub(graph, "1", 0, "C", 1);
    graph = closeRingBond(graph, "2", graph.rootId, 1);
    expect(hasRing(graph)).toBe(true);
  });
});

describe("pathBetween", () => {
  it("finds the path through a branched tree", () => {
    // seed - 1 - 2
    //          \- 3
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, 0, "C", 1);
    graph = addAtomFromStub(graph, "1", 0, "C", 1);
    graph = addAtomFromStub(graph, "1", 90, "C", 1);

    expect(pathBetween(graph, graph.rootId, "2")).toEqual([graph.rootId, "1", "2"]);
    expect(pathBetween(graph, "2", "3")).toEqual(["2", "1", "3"]);
  });
});

describe("isRingClosureLegal", () => {
  function carbonChain(length: number) {
    let graph = createSeedGraph();
    for (let i = 0; i < length - 1; i++) {
      const parent = i === 0 ? graph.rootId : String(i);
      graph = addAtomFromStub(graph, parent, 0, "C", 1);
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
    graph = addAtomFromStub(graph, "4", 0, "O", 1); // heteroatom breaks the ring path
    expect(isRingClosureLegal(graph, graph.rootId, "5")).toBe(false);
  });

  it("rejects forming a second ring", () => {
    let graph = carbonChain(6);
    graph = closeRingBond(graph, graph.rootId, "5", 1);
    graph = addAtomFromStub(graph, "5", 0, "C", 1); // "6"
    graph = addAtomFromStub(graph, "6", 0, "C", 1); // "7"
    expect(isRingClosureLegal(graph, "1", "7")).toBe(false);
  });
});
