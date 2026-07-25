import { describe, expect, it } from "vitest";
import { createSeedGraph, type MoleculeGraph } from "./types";
import {
  addAtomFromStub,
  addRing,
  closeRingBond,
  decrementBondOrder,
  deleteAtomSubtree,
  deleteBond,
  pruneToFitValency,
  reattachDisplacedNeighbours,
  replaceAtomWithRing,
  retypeAtomWithPrune,
  setAtomElement,
  setBondOrder,
  setBondOrderWithPrune,
} from "./mutations";
import {
  bondOrderBetween,
  findAtomById,
  hasRing,
  isAromaticRing,
  openSlotCount,
  findRing,
  usedValency,
} from "./queries";
import { layoutFromRoot } from "../layout/geometry";
import { displayed } from "../styles/displayed";

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

describe("setBondOrderWithPrune", () => {
  it("raises an order with nothing to prune when both endpoints have free slots", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"

    graph = setBondOrderWithPrune(graph, graph.rootId, "1", 2);

    expect(graph.atoms).toHaveLength(2); // nothing pruned
    expect(bondOrderBetween(graph, graph.rootId, "1")).toBe(2);
    expect(bondOrderBetween(graph, "1", graph.rootId)).toBe(2);
  });

  it("trims a branch off a saturated endpoint to make room for the raise", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"
    graph = addAtomFromStub(graph, "1", "O", 1); // "2", slot 1 off "1"
    graph = addAtomFromStub(graph, "1", "N", 1); // "3", slot 2 off "1"
    graph = addAtomFromStub(graph, "1", "F", 1); // "4", slot 3 off "1" -- "1" now fully saturated
    expect(usedValency(findAtomById(graph, "1")!)).toBe(4);

    graph = setBondOrderWithPrune(graph, graph.rootId, "1", 2);

    expect(bondOrderBetween(graph, graph.rootId, "1")).toBe(2);
    expect(findAtomById(graph, "4")).toBeUndefined(); // highest-slot branch pruned
    expect(findAtomById(graph, "2")).toBeDefined();
    expect(findAtomById(graph, "3")).toBeDefined();
    expect(usedValency(findAtomById(graph, "1")!)).toBe(4); // legal again, not hypervalent
  });

  it("lowers an order without touching any other branches", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 2); // "1", double parent bond
    graph = addAtomFromStub(graph, "1", "C", 1); // "2"
    graph = addAtomFromStub(graph, "1", "C", 1); // "3"

    graph = setBondOrderWithPrune(graph, graph.rootId, "1", 1);

    expect(bondOrderBetween(graph, graph.rootId, "1")).toBe(1);
    expect(findAtomById(graph, "2")).toBeDefined();
    expect(findAtomById(graph, "3")).toBeDefined();
  });

  it("is a no-op when the new order alone overshoots an endpoint's own nominal valency", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "F", 1); // "1", fluorine, valency 1

    const result = setBondOrderWithPrune(graph, graph.rootId, "1", 2);

    expect(result).toBe(graph);
  });

  it("is a no-op when an endpoint's un-prunable parent edge alone blocks the raise", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "N", 1); // "1", parent edge -- never prunable
    graph = addAtomFromStub(graph, "1", "C", 1); // "2", the bond we'll try to raise

    const result = setBondOrderWithPrune(graph, "1", "2", 3);

    expect(result).toBe(graph);
    expect(bondOrderBetween(graph, "1", "2")).toBe(1);
  });

  it("throws when there is no such bond", () => {
    const graph = createSeedGraph();
    expect(() => setBondOrderWithPrune(graph, graph.rootId, "missing", 2)).toThrow();
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

  it("deletes the whole ring, anchor included, when any of its atoms is deleted", () => {
    // methyl(seed) - anchor - [5-ring]
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // anchor = "1"
    graph = addRing(graph, "1", 5, false);
    expect(graph.atoms).toHaveLength(6);

    graph = deleteAtomSubtree(graph, "3"); // some non-anchor ring atom

    expect(graph.atoms.map((a) => a.id).sort()).toEqual([graph.rootId]);
    expect(hasRing(graph)).toBe(false);
    expect(openSlotCount(findAtomById(graph, graph.rootId)!)).toBe(4); // back to a bare, unbonded seed
  });

  it("deletes a substituent hanging off a different ring atom along with the ring", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // anchor = "1"
    graph = addRing(graph, "1", 6, false);
    graph = addAtomFromStub(graph, "3", "O", 1); // hydroxyl off a ring atom other than the one we'll delete

    graph = deleteAtomSubtree(graph, "5");

    expect(graph.atoms.map((a) => a.id).sort()).toEqual([graph.rootId]);
  });

  it("removes an aromatic ring the same way as a plain one", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // anchor = "1"
    graph = addRing(graph, "1", 6, true);

    graph = deleteAtomSubtree(graph, "4");

    expect(graph.atoms.map((a) => a.id).sort()).toEqual([graph.rootId]);
    expect(hasRing(graph)).toBe(false);
  });

  it("keeps the seed atom even when it's a ring member itself, opening the ring instead", () => {
    const seed = createSeedGraph();
    let graph = addRing(seed, seed.rootId, 6, false);
    graph = deleteAtomSubtree(graph, "3");

    expect(findAtomById(graph, seed.rootId)).toBeDefined();
    expect(hasRing(graph)).toBe(false);
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
    const graph = addRing(createSeedGraph(), "0", 6, false);
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

describe("decrementBondOrder", () => {
  it("drops a triple bond to double", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 3); // "1"

    graph = decrementBondOrder(graph, graph.rootId, "1");

    expect(bondOrderBetween(graph, graph.rootId, "1")).toBe(2);
    expect(graph.atoms).toHaveLength(2);
  });

  it("drops a double bond to single", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 2); // "1"

    graph = decrementBondOrder(graph, graph.rootId, "1");

    expect(bondOrderBetween(graph, graph.rootId, "1")).toBe(1);
    expect(graph.atoms).toHaveLength(2);
  });

  it("severs a single bond, pruning the disconnected side", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"
    graph = addAtomFromStub(graph, "1", "C", 1); // "2"

    graph = decrementBondOrder(graph, graph.rootId, "1");

    expect(graph.atoms.map((a) => a.id)).toEqual([graph.rootId]);
  });

  it("reopens a ring by severing just the closing bond, without pruning any atom", () => {
    let graph = createSeedGraph();
    for (let i = 0; i < 5; i++) {
      const parent = i === 0 ? graph.rootId : String(i);
      graph = addAtomFromStub(graph, parent, "C", 1);
    }
    graph = closeRingBond(graph, "5", graph.rootId, 1);

    graph = decrementBondOrder(graph, "5", graph.rootId);

    expect(graph.atoms).toHaveLength(6);
    expect(hasRing(graph)).toBe(false);
  });

  it("throws when there is no such bond", () => {
    const graph = createSeedGraph();
    expect(() => decrementBondOrder(graph, graph.rootId, "does-not-exist")).toThrow();
  });
});

describe("pruneToFitValency", () => {
  it("is a no-op (same graph reference) when the atom already fits", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1);

    const pruned = pruneToFitValency(graph, graph.rootId, 4);

    expect(pruned).toBe(graph);
  });

  it("trims one branch, preferring the higher-slot (more branch-like) attachment", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1", slot 1
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "2", slot 2
    expect(usedValency(findAtomById(graph, graph.rootId)!)).toBe(2);

    graph = pruneToFitValency(graph, graph.rootId, 1);

    expect(graph.atoms.map((a) => a.id).sort()).toEqual([graph.rootId, "1"]);
    expect(usedValency(findAtomById(graph, graph.rootId)!)).toBe(1);
  });

  it("trims multiple branches down to the single lowest-slot (primary chain) survivor", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1", slot 1
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "2", slot 2
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "3", slot 3
    expect(usedValency(findAtomById(graph, graph.rootId)!)).toBe(3);

    graph = pruneToFitValency(graph, graph.rootId, 1);

    expect(graph.atoms.map((a) => a.id).sort()).toEqual([graph.rootId, "1"]);
    expect(findAtomById(graph, "1")!.slotFromParent).toBe(1);
  });

  it("never touches the parent edge, even if it alone still overshoots the target", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "N", 2); // "1", double-bonded parent edge

    const pruned = pruneToFitValency(graph, "1", 1);

    expect(pruned).toBe(graph); // nothing else to trim -- the parent edge is off-limits
    expect(usedValency(findAtomById(pruned, "1")!)).toBe(2);
  });

  it("opens a ring rather than deleting atoms, when just reducing the closing bond is enough", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // anchor = "1"
    graph = addRing(graph, "1", 5, false);
    expect(usedValency(findAtomById(graph, "1")!)).toBe(3); // parent + ring child + ring closing

    graph = pruneToFitValency(graph, "1", 2);

    expect(hasRing(graph)).toBe(false);
    expect(graph.atoms).toHaveLength(6); // no atom lost -- just the redundant ring edge
    expect(usedValency(findAtomById(graph, "1")!)).toBe(2);
  });

  it("sheds the whole ring, atoms included, when the target leaves no room for it at all", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // anchor = "1"
    graph = addRing(graph, "1", 5, false);

    graph = pruneToFitValency(graph, "1", 1);

    expect(hasRing(graph)).toBe(false);
    expect(graph.atoms.map((a) => a.id).sort()).toEqual([graph.rootId, "1"]);
    expect(usedValency(findAtomById(graph, "1")!)).toBe(1);
  });
});

describe("retypeAtomWithPrune", () => {
  it("retypes without pruning when the new element's valency already fits", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"

    graph = retypeAtomWithPrune(graph, "1", "O");

    const atom = findAtomById(graph, "1")!;
    expect(atom.element).toBe("O");
    expect(atom.bonds).toEqual([{ to: graph.rootId, order: 1 }]);
  });

  it("prunes branches that no longer fit before retyping to a lower-valency element", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"
    graph = addAtomFromStub(graph, "1", "C", 1); // "2", slot 1 off "1"
    graph = addAtomFromStub(graph, "1", "C", 1); // "3", slot 2 off "1"
    // "1" is carbon with parent(1) + two branches(1,1) = used valency 3.

    graph = retypeAtomWithPrune(graph, "1", "N"); // nitrogen's valency is 3 -- everything still fits

    let atom = findAtomById(graph, "1")!;
    expect(atom.element).toBe("N");
    expect(atom.bonds).toHaveLength(3);

    graph = retypeAtomWithPrune(graph, "1", "O"); // oxygen's valency is 2 -- one branch must go

    atom = findAtomById(graph, "1")!;
    expect(atom.element).toBe("O");
    expect(usedValency(atom)).toBe(2);
    expect(atom.bonds).toHaveLength(2);
  });
});

describe("replaceAtomWithRing", () => {
  it("replaces a carbon anchor with the requested ring", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"

    graph = replaceAtomWithRing(graph, "1", 6, false);

    const ring = findRing(graph)!;
    expect(ring).toHaveLength(6);
    expect(ring).toContain("1");
  });

  it("re-homes branches onto other ring atoms instead of destroying them, when the anchor lacks the open valency", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"
    graph = addAtomFromStub(graph, "1", "O", 1); // "2"
    graph = addAtomFromStub(graph, "1", "N", 1); // "3" -- "1" now has only 1 open slot
    expect(openSlotCount(findAtomById(graph, "1")!)).toBe(1);

    graph = replaceAtomWithRing(graph, "1", 6, true); // aromatic needs 3 open slots, leaving none directly on "1"

    const ring = findRing(graph)!;
    expect(ring).toContain("1");
    // Neither branch fit on the anchor itself, but both survive elsewhere on the ring.
    expect(findAtomById(graph, "2")).toBeDefined();
    expect(findAtomById(graph, "3")).toBeDefined();
    expect(bondOrderBetween(graph, findAtomById(graph, "2")!.parentId!, "2")).toBe(1);
    expect(bondOrderBetween(graph, findAtomById(graph, "3")!.parentId!, "3")).toBe(1);
    for (const atom of graph.atoms) expect(usedValency(atom)).toBeLessThanOrEqual(4);
  });

  it("is a no-op, leaving the graph unchanged, through a non-carbon atom", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "O", 1); // "1"

    const result = replaceAtomWithRing(graph, "1", 6, false);

    expect(result).toBe(graph);
  });

  it("is a no-op when a ring already exists in the molecule", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"
    graph = addRing(graph, "1", 5, false);
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "6", a second substituent on the seed

    const result = replaceAtomWithRing(graph, "6", 6, false);

    expect(result).toBe(graph);
  });

  it("is a no-op, without leaving a partially-pruned atom, when it still can't fit after pruning", () => {
    // "1" is carbon with nothing to prune off it, but its own parent bond is
    // a double bond -- pruning can never touch that, so even with every other
    // branch gone it's stuck at 2 used valency, short of the 1 an aromatic
    // ring's 3-open-slot requirement demands.
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 2); // "1"

    const result = replaceAtomWithRing(graph, "1", 6, true);

    expect(result).toBe(graph);
    expect(findAtomById(result, "1")!.element).toBe("C");
    expect(hasRing(result)).toBe(false);
  });

  it("preserves all three C-O bonds of methanetriol's carbon when replaced with cyclopropane", () => {
    // The root carbon stands in for methanetriol's central atom: three C-O
    // bonds and an implicit fourth hydrogen, no parent edge to protect.
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "O", 1); // "1"
    graph = addAtomFromStub(graph, graph.rootId, "O", 1); // "2"
    graph = addAtomFromStub(graph, graph.rootId, "O", 1); // "3"

    graph = replaceAtomWithRing(graph, graph.rootId, 3, false);

    const ring = findRing(graph)!;
    expect(ring).toHaveLength(3);
    for (const oxygenId of ["1", "2", "3"]) {
      const oxygen = findAtomById(graph, oxygenId)!;
      expect(oxygen.parentId).toBeDefined();
      expect(ring).toContain(oxygen.parentId);
      expect(bondOrderBetween(graph, oxygen.parentId!, oxygenId)).toBe(1);
    }
    for (const atom of graph.atoms) expect(usedValency(atom)).toBeLessThanOrEqual(4);
  });

  it("re-homes a double-bonded neighbour onto a ring atom that still has 2 free slots", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 2); // anchor = "1", double-bonded to the root
    graph = addAtomFromStub(graph, "1", "O", 2); // "2" -- double-bonded child, must land on a 2-slot host
    // "1" is now fully saturated (parent double bond + child double bond = 4), so a plain ring
    // (needing 2 open slots) forces the child off the anchor entirely.

    graph = replaceAtomWithRing(graph, "1", 4, false);

    const oxygen = findAtomById(graph, "2")!;
    expect(oxygen.parentId).not.toBe("1"); // couldn't stay -- "1" has no room once its own parent bond is honored
    expect(bondOrderBetween(graph, oxygen.parentId!, "2")).toBe(2);
    expect(openSlotCount(findAtomById(graph, oxygen.parentId!)!)).toBeGreaterThanOrEqual(0);
    for (const atom of graph.atoms) expect(usedValency(atom)).toBeLessThanOrEqual(4);
  });

  it("drops a double-bonded neighbour when every ring atom (an aromatic ring's uniform 1-slot vertices) is too cramped to host it", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1" -- single-bonded parent, so the aromatic ring still fits
    graph = addAtomFromStub(graph, "1", "O", 2); // "2" -- needs a 2-slot host

    graph = replaceAtomWithRing(graph, "1", 6, true); // aromatic: every ring vertex ends up with only 1 free slot

    expect(findAtomById(graph, "2")).toBeUndefined(); // nowhere with 2 free slots -- dropped
    for (const atom of graph.atoms) expect(usedValency(atom)).toBeLessThanOrEqual(4);
  });

  it("preserves the maximum number of same-order branches the ring can host, dropping the cheapest (smallest) one", () => {
    // "1" is built with 5 single-bonded branches directly attached -- more
    // than its nominal valency allows, the same "just wire up the bonds"
    // trick setBondOrder's nitro test uses, deliberately over capacity so a
    // real choice has to be made about what survives.
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 2); // anchor = "1", double parent bond -- "1" itself ends up with no room of its own

    const branchSizes = [1, 2, 3, 4, 5]; // cost of each branch, smallest first
    const branchIds: string[][] = [];
    for (const size of branchSizes) {
      const chain: string[] = [];
      let parent = "1";
      for (let i = 0; i < size; i++) {
        const newId = String(graph.nextId);
        graph = addAtomFromStub(graph, parent, "C", 1);
        chain.push(newId);
        parent = newId;
      }
      branchIds.push(chain);
    }

    // Smallest ring (3) keeps the total room the new atoms + the (room-less)
    // anchor can offer as small as possible, so demand (5 branches) outstrips it.
    graph = replaceAtomWithRing(graph, "1", 3, false);

    const survivingRoots = branchIds.filter((chain) => findAtomById(graph, chain[0]) !== undefined);
    const droppedRoots = branchIds.filter((chain) => findAtomById(graph, chain[0]) === undefined);

    expect(droppedRoots).toHaveLength(1);
    expect(droppedRoots[0]).toEqual(branchIds[0]); // the size-1 branch -- cheapest to lose
    expect(survivingRoots).toHaveLength(4);
    // Every surviving branch's whole subtree came along, not just its root atom.
    for (const chain of survivingRoots) {
      for (const id of chain) expect(findAtomById(graph, id)).toBeDefined();
    }
    for (const atom of graph.atoms) expect(usedValency(atom)).toBeLessThanOrEqual(4);
  });

  it("keeps a benzene replacement's preserved count and valency correct when demand exceeds the ring's fixed capacity", () => {
    let graph = createSeedGraph(); // anchor is the root -- no parent edge to worry about
    const leaves = ["1", "2", "3", "4", "5", "6", "7"];
    for (const _ of leaves) graph = addAtomFromStub(graph, graph.rootId, "C", 1); // 7 single-bonded leaves, over the root's nominal valency

    graph = replaceAtomWithRing(graph, graph.rootId, 6, true);

    const ring = findRing(graph)!;
    expect(ring).toHaveLength(6);
    expect(isAromaticRing(graph, ring)).toBe(true); // Kekule alternation intact

    const surviving = leaves.filter((id) => findAtomById(graph, id) !== undefined);
    expect(surviving).toHaveLength(6); // capacity for exactly 6 of the 7 leaves
    for (const atom of graph.atoms) expect(usedValency(atom)).toBeLessThanOrEqual(4);
  });

  it("gives every re-parented neighbour a coherent parentId/slotFromParent, and lays out every surviving atom", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "O", 1); // "1"
    graph = addAtomFromStub(graph, graph.rootId, "O", 1); // "2"
    graph = addAtomFromStub(graph, graph.rootId, "O", 1); // "3"

    graph = replaceAtomWithRing(graph, graph.rootId, 3, false);

    for (const oxygenId of ["1", "2", "3"]) {
      const oxygen = findAtomById(graph, oxygenId)!;
      const host = findAtomById(graph, oxygen.parentId!)!;
      // No sibling under the same host shares its slot.
      const siblingSlots = graph.atoms
        .filter((a) => a.parentId === host.id && a.id !== oxygenId)
        .map((a) => a.slotFromParent);
      expect(siblingSlots).not.toContain(oxygen.slotFromParent);
    }

    const positions = layoutFromRoot(graph, displayed);
    for (const atom of graph.atoms) expect(positions.has(atom.id)).toBe(true);
  });
});

describe("reattachDisplacedNeighbours", () => {
  it("places a displaced neighbour onto the first host that has room, bonding it symmetrically", () => {
    const graph: MoleculeGraph = {
      rootId: "0",
      nextId: 4,
      atoms: [
        { id: "0", element: "C", bonds: [{ to: "1", order: 1 }, { to: "2", order: 1 }] },
        { id: "1", element: "C", bonds: [{ to: "0", order: 1 }], parentId: "0", slotFromParent: 1 },
        { id: "2", element: "C", bonds: [{ to: "0", order: 1 }], parentId: "0", slotFromParent: 2 },
        { id: "3", element: "O", bonds: [] }, // already detached from wherever it used to live
      ],
    };

    const result = reattachDisplacedNeighbours(graph, [{ atomId: "3", order: 1 }], ["1", "2"]);

    expect(findAtomById(result, "3")!.parentId).toBe("1");
    expect(findAtomById(result, "3")!.slotFromParent).toBe(1);
    expect(bondOrderBetween(result, "1", "3")).toBe(1);
    expect(bondOrderBetween(result, "3", "1")).toBe(1);
  });

  it("brings a displaced neighbour's whole subtree along when it's re-homed", () => {
    const graph: MoleculeGraph = {
      rootId: "0",
      nextId: 4,
      atoms: [
        { id: "0", element: "C", bonds: [{ to: "1", order: 1 }] },
        { id: "1", element: "C", bonds: [{ to: "0", order: 1 }], parentId: "0", slotFromParent: 1 },
        { id: "2", element: "C", bonds: [{ to: "3", order: 1 }] }, // detached neighbour, still carrying its own child
        { id: "3", element: "O", bonds: [{ to: "2", order: 1 }], parentId: "2", slotFromParent: 1 },
      ],
    };

    const result = reattachDisplacedNeighbours(graph, [{ atomId: "2", order: 1 }], ["1"]);

    expect(findAtomById(result, "2")!.parentId).toBe("1");
    expect(findAtomById(result, "3")).toBeDefined(); // "2"'s own child survives untouched
    expect(findAtomById(result, "3")!.parentId).toBe("2");
  });

  it("drops a displaced neighbour (and its subtree) when no host has room", () => {
    const graph: MoleculeGraph = {
      rootId: "0",
      nextId: 4,
      atoms: [
        { id: "0", element: "C", bonds: [{ to: "1", order: 1 }] },
        {
          id: "1",
          element: "C",
          bonds: [
            { to: "0", order: 1 },
            { to: "x", order: 1 },
            { to: "y", order: 1 },
            { to: "z", order: 1 },
          ],
          parentId: "0",
          slotFromParent: 1,
        },
        { id: "2", element: "O", bonds: [] },
      ],
    };

    const result = reattachDisplacedNeighbours(graph, [{ atomId: "2", order: 1 }], ["1"]);

    expect(findAtomById(result, "2")).toBeUndefined();
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
