import { describe, expect, it } from "vitest";
import { createSeedGraph } from "./types";
import {
  addAtomFromStub,
  addRing,
  closeRingBond,
  deleteAtomSubtree,
  deleteBond,
  setAtomElement,
  setBondOrder,
} from "./mutations";
import { bondOrderBetween, findAtomById, hasRing, isAromaticRing, openSlotCount, findRing } from "./queries";

describe("createSeedGraph", () => {
  it("starts with one open carbon", () => {
    const graph = createSeedGraph();
    expect(graph.atoms).toHaveLength(1);
    expect(graph.atoms[0].element).toBe("C");
    expect(openSlotCount(graph.atoms[0])).toBe(4);
  });
});

describe("addAtomFromStub", () => {
  it("bonds the new atom to its parent symmetrically", () => {
    const seed = createSeedGraph();
    const grown = addAtomFromStub(seed, seed.rootId, "O", 1);

    expect(grown.atoms).toHaveLength(2);
    const parent = findAtomById(grown, seed.rootId)!;
    const child = findAtomById(grown, "1")!;
    expect(parent.bonds).toEqual([{ to: "1", order: 1 }]);
    expect(child.bonds).toEqual([{ to: seed.rootId, order: 1 }]);
    expect(child.slotFromParent).toBe(1);
  });

  it("assigns the lowest unused slot, in growth order", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1" -> slot 1
    graph = addAtomFromStub(graph, graph.rootId, "O", 1); // "2" -> slot 2
    graph = addAtomFromStub(graph, graph.rootId, "N", 1); // "3" -> slot 3

    expect(findAtomById(graph, "1")!.slotFromParent).toBe(1);
    expect(findAtomById(graph, "2")!.slotFromParent).toBe(2);
    expect(findAtomById(graph, "3")!.slotFromParent).toBe(3);
  });

  it("reuses a freed slot once its occupant is deleted, without disturbing surviving siblings", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1" -> slot 1
    graph = addAtomFromStub(graph, graph.rootId, "O", 1); // "2" -> slot 2
    graph = addAtomFromStub(graph, graph.rootId, "N", 1); // "3" -> slot 3

    graph = deleteAtomSubtree(graph, "2"); // frees slot 2

    graph = addAtomFromStub(graph, graph.rootId, "S", 1); // "4"

    expect(findAtomById(graph, "4")!.slotFromParent).toBe(2);
    // Surviving siblings keep their original slots — no reflow.
    expect(findAtomById(graph, "1")!.slotFromParent).toBe(1);
    expect(findAtomById(graph, "3")!.slotFromParent).toBe(3);
  });

  it("never reuses an id, even after deletions", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // id "1"
    graph = deleteAtomSubtree(graph, "1");
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // must not reuse "1"

    expect(graph.atoms.map((a) => a.id)).toEqual(["0", "2"]);
  });

  it("throws when the parent doesn't exist", () => {
    const seed = createSeedGraph();
    expect(() => addAtomFromStub(seed, "missing", "C", 1)).toThrow();
  });
});

describe("setBondOrder", () => {
  it("updates the order symmetrically on both atoms", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "O", 1);
    graph = setBondOrder(graph, graph.rootId, "1", 2);

    expect(findAtomById(graph, graph.rootId)!.bonds[0].order).toBe(2);
    expect(findAtomById(graph, "1")!.bonds[0].order).toBe(2);
  });

  it("is not clamped by valence, so nitro's hypervalent N is buildable", () => {
    // C(seed) -N -O, -O, all single: exactly nitrogen's nominal valency (3).
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "N", 1); // id "1"
    graph = addAtomFromStub(graph, "1", "O", 1); // id "2"
    graph = addAtomFromStub(graph, "1", "O", 1); // id "3"

    // Upgrading both N-O bonds to double pushes N to 1 + 2 + 2 = 5, over nominal valency 3.
    expect(() => {
      graph = setBondOrder(graph, "1", "2", 2);
      graph = setBondOrder(graph, "1", "3", 2);
    }).not.toThrow();

    const nitrogen = findAtomById(graph, "1")!;
    expect(nitrogen.bonds.map((b) => b.order)).toEqual([1, 2, 2]);
  });

  it("throws when there is no such bond", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "O", 1);
    expect(() => setBondOrder(graph, graph.rootId, "does-not-exist", 2)).toThrow();
  });
});

describe("setAtomElement", () => {
  it("changes the element without touching bonds", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "O", 1);
    graph = setAtomElement(graph, "1", "N");

    const atom = findAtomById(graph, "1")!;
    expect(atom.element).toBe("N");
    expect(atom.bonds).toEqual([{ to: graph.rootId, order: 1 }]);
  });
});

describe("deleteAtomSubtree", () => {
  it("prunes everything reachable only through the deleted atom", () => {
    // A(seed) - B - C - D
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // B = "1"
    graph = addAtomFromStub(graph, "1", "C", 1); // C = "2"
    graph = addAtomFromStub(graph, "2", "C", 1); // D = "3"

    graph = deleteAtomSubtree(graph, "1");

    expect(graph.atoms.map((a) => a.id).sort()).toEqual([graph.rootId]);
  });

  it("refuses to delete the seed atom", () => {
    const graph = createSeedGraph();
    expect(() => deleteAtomSubtree(graph, graph.rootId)).toThrow();
  });

  it("only shortens a ring, leaving the rest connected", () => {
    // Six-carbon ring: seed(0)-1-2-3-4-5-back to seed.
    let graph = createSeedGraph();
    for (let i = 0; i < 5; i++) {
      const parent = i === 0 ? graph.rootId : String(i);
      graph = addAtomFromStub(graph, parent, "C", 1);
    }
    graph = closeRingBond(graph, "5", graph.rootId, 1);
    expect(hasRing(graph)).toBe(true);

    graph = deleteAtomSubtree(graph, "3");

    expect(graph.atoms).toHaveLength(5);
    expect(hasRing(graph)).toBe(false); // ring is now an open chain
  });
});

describe("closeRingBond", () => {
  it("bonds two existing atoms without creating a new one", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"
    graph = addAtomFromStub(graph, "1", "C", 1); // "2"

    const before = graph.atoms.length;
    graph = closeRingBond(graph, "2", graph.rootId, 1);

    expect(graph.atoms).toHaveLength(before);
    expect(hasRing(graph)).toBe(true);
  });

  it("throws if the atoms are already bonded", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1);
    expect(() => closeRingBond(graph, graph.rootId, "1", 1)).toThrow();
  });
});

describe("addRing", () => {
  it("grows a plain ring of `size` all-single bonds through the anchor", () => {
    const graph = addRing(createSeedGraph(), "0", 6, false);

    expect(graph.atoms).toHaveLength(6);
    const ring = findRing(graph)!;
    expect(ring).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(bondOrderBetween(graph, ring[i], ring[(i + 1) % 6])).toBe(1);
    }
    expect(isAromaticRing(graph, ring)).toBe(false);
  });

  it("grows an aromatic ring with alternating Kekule bond orders", () => {
    const graph = addRing(createSeedGraph(), "0", 6, true);

    const ring = findRing(graph)!;
    expect(isAromaticRing(graph, ring)).toBe(true);
    // Every ring atom carries exactly one single + one double ring bond.
    for (const id of ring) {
      const atom = findAtomById(graph, id)!;
      const ringOrders = atom.bonds
        .filter((b) => ring.includes(b.to))
        .map((b) => b.order)
        .sort();
      expect(ringOrders).toEqual([1, 2]);
    }
  });

  it("grows through a non-root anchor, leaving the rest of the chain intact", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"

    graph = addRing(graph, "1", 5, false);

    expect(hasRing(graph)).toBe(true);
    expect(findAtomById(graph, graph.rootId)).toBeDefined();
  });

  it("is a single mutation: the whole ring composes from existing atom/bond primitives", () => {
    const before = createSeedGraph();
    const after = addRing(before, "0", 4, false);
    expect(after.atoms).toHaveLength(4);
    expect(hasRing(after)).toBe(true);
  });

  it("throws through a non-carbon anchor", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "O", 1); // "1"
    expect(() => addRing(graph, "1", 6, false)).toThrow();
  });

  it("throws when a ring already exists", () => {
    let graph = addRing(createSeedGraph(), "0", 6, false);
    expect(() => addRing(graph, "0", 5, false)).toThrow();
  });

  it("throws for an out-of-range size", () => {
    expect(() => addRing(createSeedGraph(), "0", 2, false)).toThrow();
    expect(() => addRing(createSeedGraph(), "0", 11, false)).toThrow();
  });

  it("throws for a non-6 aromatic ring", () => {
    expect(() => addRing(createSeedGraph(), "0", 5, true)).toThrow();
  });

  it("throws when the anchor lacks the open valency", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1);
    graph = addAtomFromStub(graph, graph.rootId, "C", 1);
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // root down to 1 open slot
    expect(() => addRing(graph, graph.rootId, 6, false)).toThrow(); // needs 2
  });
});

describe("deleteBond", () => {
  it("reopens a ring by removing just the edge", () => {
    let graph = createSeedGraph();
    for (let i = 0; i < 5; i++) {
      const parent = i === 0 ? graph.rootId : String(i);
      graph = addAtomFromStub(graph, parent, "C", 1);
    }
    graph = closeRingBond(graph, "5", graph.rootId, 1);

    graph = deleteBond(graph, "5", graph.rootId);

    expect(graph.atoms).toHaveLength(6); // no atom removed
    expect(hasRing(graph)).toBe(false);
  });

  it("prunes the child side when deleting a plain tree bond", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"
    graph = addAtomFromStub(graph, "1", "C", 1); // "2"

    graph = deleteBond(graph, graph.rootId, "1");

    expect(graph.atoms.map((a) => a.id)).toEqual([graph.rootId]);
  });
});
