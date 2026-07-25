import { describe, expect, it } from "vitest";
import { createSeedGraph, PERIODIC_TABLE } from "./types";
import { addAtomFromStub } from "./mutations";
import { findAtomById, openSlotCount, usedValency } from "./queries";
import {
  addFunctionalGroupFromStub,
  canReplaceWithGroup,
  FUNCTIONAL_GROUP_IDS,
  FUNCTIONAL_GROUPS,
  replaceAtomWithFunctionalGroup,
  type FunctionalGroupId,
} from "./functionalGroups";

describe("FUNCTIONAL_GROUPS vocabulary", () => {
  it("is exactly the engine-supported list, each appearing once in the menu order", () => {
    const ids = Object.keys(FUNCTIONAL_GROUPS).sort();
    expect(ids).toEqual(
      [
        "acylChloride",
        "aldehyde",
        "amide",
        "amine",
        "carboxylicAcid",
        "hydroxyl",
        "methoxy",
        "nitrile",
        "nitro",
        "thiol",
      ].sort(),
    );
    expect(new Set(FUNCTIONAL_GROUP_IDS).size).toBe(FUNCTIONAL_GROUP_IDS.length);
    expect(FUNCTIONAL_GROUP_IDS.sort()).toEqual(ids);
  });

  it("every group is grown correctly off a fresh stub, atom-for-atom and bond-for-bond", () => {
    const expected: Record<FunctionalGroupId, { atomCount: number; elements: string[] }> = {
      carboxylicAcid: { atomCount: 3, elements: ["C", "O", "O"] },
      acylChloride: { atomCount: 3, elements: ["C", "O", "Cl"] },
      amide: { atomCount: 3, elements: ["C", "O", "N"] },
      nitrile: { atomCount: 2, elements: ["C", "N"] },
      aldehyde: { atomCount: 2, elements: ["C", "O"] },
      hydroxyl: { atomCount: 1, elements: ["O"] },
      thiol: { atomCount: 1, elements: ["S"] },
      amine: { atomCount: 1, elements: ["N"] },
      nitro: { atomCount: 3, elements: ["N", "O", "O"] },
      methoxy: { atomCount: 2, elements: ["O", "C"] },
    };

    for (const groupId of FUNCTIONAL_GROUP_IDS) {
      const graph = addFunctionalGroupFromStub(createSeedGraph(), "0", groupId);
      const { atomCount, elements } = expected[groupId];

      expect(graph.atoms).toHaveLength(1 + atomCount);
      const grownIds = graph.atoms.map((a) => a.id).filter((id) => id !== "0");
      expect(grownIds).toHaveLength(atomCount);
      expect(grownIds.map((id) => findAtomById(graph, id)!.element).sort()).toEqual([...elements].sort());

      // Symmetric bonds and legal valency everywhere -- nitro's nitrogen is
      // the engine's one deliberate exception (see FUNCTIONAL_GROUPS' own
      // comment on it).
      for (const atom of graph.atoms) {
        for (const bond of atom.bonds) {
          expect(findAtomById(graph, bond.to)!.bonds.some((b) => b.to === atom.id && b.order === bond.order)).toBe(
            true,
          );
        }
        if (groupId === "nitro" && atom.element === "N" && atom.id !== "0") {
          expect(usedValency(atom)).toBe(5); // 1 (to methane's carbon) + 2 + 2
          continue;
        }
        expect(usedValency(atom)).toBeLessThanOrEqual(PERIODIC_TABLE[atom.element].valency);
      }
    }
  });

  it("carboxylic acid is C(=O)(OH) attached by a single bond, with the carbonyl carbon fully saturated", () => {
    const graph = addFunctionalGroupFromStub(createSeedGraph(), "0", "carboxylicAcid");
    const carbonylCarbon = findAtomById(graph, "1")!;
    expect(carbonylCarbon.element).toBe("C");
    expect(carbonylCarbon.bonds.map((b) => b.order).sort()).toEqual([1, 1, 2]);
    expect(openSlotCount(carbonylCarbon)).toBe(0);

    const doubleO = carbonylCarbon.bonds.find((b) => b.order === 2)!;
    expect(findAtomById(graph, doubleO.to)!.element).toBe("O");
    expect(openSlotCount(findAtomById(graph, doubleO.to)!)).toBe(0); // carbonyl O has no H

    const hydroxylOId = carbonylCarbon.bonds.find((b) => b.order === 1 && b.to !== "0")!.to;
    expect(openSlotCount(findAtomById(graph, hydroxylOId)!)).toBe(1); // renders as -OH
  });

  it("nitrile is a triple bond, with the nitrile carbon fully saturated and no room for an H", () => {
    const graph = addFunctionalGroupFromStub(createSeedGraph(), "0", "nitrile");
    const carbon = findAtomById(graph, "1")!;
    expect(carbon.bonds).toEqual([
      { to: "0", order: 1 },
      { to: "2", order: 3 },
    ]);
    expect(openSlotCount(carbon)).toBe(0);
    expect(openSlotCount(findAtomById(graph, "2")!)).toBe(0);
  });

  it("aldehyde's carbon keeps exactly one open slot -- its own implicit H", () => {
    const graph = addFunctionalGroupFromStub(createSeedGraph(), "0", "aldehyde");
    expect(openSlotCount(findAtomById(graph, "1")!)).toBe(1);
  });

  it("hydroxyl, thiol, and amine are single atoms whose open slots render the right H count", () => {
    expect(openSlotCount(findAtomById(addFunctionalGroupFromStub(createSeedGraph(), "0", "hydroxyl"), "1")!)).toBe(1);
    expect(openSlotCount(findAtomById(addFunctionalGroupFromStub(createSeedGraph(), "0", "thiol"), "1")!)).toBe(1);
    expect(openSlotCount(findAtomById(addFunctionalGroupFromStub(createSeedGraph(), "0", "amine"), "1")!)).toBe(2);
  });

  it("methoxy's methyl carbon has spare valency of its own (3 open slots)", () => {
    const graph = addFunctionalGroupFromStub(createSeedGraph(), "0", "methoxy");
    const oxygen = findAtomById(graph, "1")!;
    expect(oxygen.element).toBe("O");
    expect(openSlotCount(oxygen)).toBe(0); // O-R and O-CH3 both spoken for
    const methyl = findAtomById(graph, "2")!;
    expect(methyl.element).toBe("C");
    expect(openSlotCount(methyl)).toBe(3);
  });

  it("nitro is the hypervalent exception: its nitrogen legitimately exceeds nominal valency", () => {
    const graph = addFunctionalGroupFromStub(createSeedGraph(), "0", "nitro");
    const nitrogen = findAtomById(graph, "1")!;
    expect(nitrogen.element).toBe("N");
    expect(usedValency(nitrogen)).toBe(5); // 1 + 2 + 2, over nominal valency 3
    expect(nitrogen.bonds.map((b) => b.order).sort()).toEqual([1, 2, 2]);
  });
});

describe("addFunctionalGroupFromStub", () => {
  it("attaches the group's attachment atom directly to the stub's parent via a single bond", () => {
    const graph = addFunctionalGroupFromStub(createSeedGraph(), "0", "hydroxyl");
    expect(graph.atoms).toHaveLength(2);
    const root = findAtomById(graph, "0")!;
    expect(root.bonds).toEqual([{ to: "1", order: 1 }]);
  });

  it("is a no-op, returning the graph unchanged, when the parent atom has no open slot", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1);
    graph = addAtomFromStub(graph, "0", "C", 1);
    graph = addAtomFromStub(graph, "0", "C", 1);
    graph = addAtomFromStub(graph, "0", "C", 1); // root now fully saturated
    expect(openSlotCount(findAtomById(graph, "0")!)).toBe(0);

    const result = addFunctionalGroupFromStub(graph, "0", "hydroxyl");

    expect(result).toBe(graph);
  });

  it("throws when the parent atom doesn't exist", () => {
    expect(() => addFunctionalGroupFromStub(createSeedGraph(), "missing", "hydroxyl")).toThrow();
  });
});

describe("canReplaceWithGroup", () => {
  it("allows replacing a chain carbon with -COOH", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1", single-bonded chain carbon

    expect(canReplaceWithGroup(graph, "1", "carboxylicAcid")).toBe(true);
  });

  it("refuses a terminal iodine, regardless of the group", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "I", 1); // "1"

    expect(canReplaceWithGroup(graph, "1", "carboxylicAcid")).toBe(false);
    expect(canReplaceWithGroup(graph, "1", "hydroxyl")).toBe(false);
  });

  it("refuses a group whose attachment atom can't carry a double-bonded parent edge", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 2); // "1", double-bonded to its parent

    // Carboxylic acid's carbon is already fully spoken for internally (=O + -OH), leaving no room for a parent bond above order 1.
    expect(canReplaceWithGroup(graph, "1", "carboxylicAcid")).toBe(false);
    // Amine's nitrogen has no internal bonds at all, so it comfortably carries order 2.
    expect(canReplaceWithGroup(graph, "1", "amine")).toBe(true);
  });

  it("allows nitro only through a single-bonded parent edge, per the engine's one legal hypervalent form", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1"
    expect(canReplaceWithGroup(graph, "1", "nitro")).toBe(true);

    graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 2); // "1", double-bonded parent
    expect(canReplaceWithGroup(graph, "1", "nitro")).toBe(false);
  });

  it("allows replacing the seed (root) atom, which has no parent edge to preserve", () => {
    const graph = createSeedGraph();
    expect(canReplaceWithGroup(graph, "0", "carboxylicAcid")).toBe(true);
  });

  it("refuses a missing atom", () => {
    expect(canReplaceWithGroup(createSeedGraph(), "missing", "hydroxyl")).toBe(false);
  });
});

describe("replaceAtomWithFunctionalGroup", () => {
  it("replaces a plain carbon in place, preserving its parent edge", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1"

    graph = replaceAtomWithFunctionalGroup(graph, "1", "hydroxyl");

    const atom = findAtomById(graph, "1")!;
    expect(atom.element).toBe("O");
    expect(atom.bonds).toEqual([{ to: "0", order: 1 }]);
  });

  it("is a no-op, returning the graph unchanged, through an invalid target", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "I", 1); // "1"

    const result = replaceAtomWithFunctionalGroup(graph, "1", "carboxylicAcid");

    expect(result).toBe(graph);
  });

  it("keeps every substituent when the finished group has room for all of them", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1", target
    graph = addAtomFromStub(graph, "1", "F", 1); // "2"

    // Amine's nitrogen (valency 3) has 2 spare slots after the parent bond -- room for the one displaced substituent.
    graph = replaceAtomWithFunctionalGroup(graph, "1", "amine");

    const nitrogen = findAtomById(graph, "1")!;
    expect(nitrogen.element).toBe("N");
    expect(nitrogen.bonds).toHaveLength(2); // parent + the preserved fluorine
    expect(findAtomById(graph, "2")).toBeDefined();
    expect(findAtomById(graph, "2")!.parentId).toBe("1");
  });

  it("preserves the maximum number of substituents, dropping only what has no room, with the parent edge always kept and valency never broken", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1", target carbon
    graph = addAtomFromStub(graph, "1", "F", 1); // "2"
    graph = addAtomFromStub(graph, "1", "Cl", 1); // "3"
    graph = addAtomFromStub(graph, "1", "Br", 1); // "4" -- "1" now fully saturated (parent + 3 substituents)
    expect(usedValency(findAtomById(graph, "1")!)).toBe(4);

    // Nitrile has zero spare valency anywhere in the finished fragment (its
    // carbon is parent(1) + triple-bond(3) = 4, its nitrogen is triple-bond
    // only = 3) -- none of the three substituents can survive.
    const replaced = replaceAtomWithFunctionalGroup(graph, "1", "nitrile");

    const carbon = findAtomById(replaced, "1")!;
    expect(carbon.element).toBe("C");
    expect(carbon.bonds).toEqual([{ to: "0", order: 1 }, { to: expect.any(String), order: 3 }]);
    expect(usedValency(carbon)).toBeLessThanOrEqual(4);
    expect(findAtomById(replaced, "2")).toBeUndefined();
    expect(findAtomById(replaced, "3")).toBeUndefined();
    expect(findAtomById(replaced, "4")).toBeUndefined();
  });

  it("re-homes a displaced substituent onto a non-attachment atom of the new group that has spare valency", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1", target
    graph = addAtomFromStub(graph, "1", "F", 1); // "2" -- "1" has parent(1) + F(1) = 2 used, 2 open

    // Methoxy's own O-attachment is fully saturated (O-R + O-CH3), but its
    // methyl carbon has 3 spare slots -- the fluorine should land there.
    graph = replaceAtomWithFunctionalGroup(graph, "1", "methoxy");

    const oxygen = findAtomById(graph, "1")!;
    expect(oxygen.element).toBe("O");
    expect(oxygen.bonds).toHaveLength(2); // parent + the methyl carbon, nothing else fits

    const fluorine = findAtomById(graph, "2")!;
    const methylId = oxygen.bonds.find((b) => b.to !== "0")!.to;
    expect(fluorine.parentId).toBe(methylId);
    expect(fluorine.bonds).toEqual([{ to: methylId, order: 1 }]);
    const methyl = findAtomById(graph, methylId)!;
    expect(methyl.bonds.some((b) => b.to === "2")).toBe(true);
  });

  it("drops the cheapest branches first when only one substituent can survive", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1", target
    graph = addAtomFromStub(graph, "1", "F", 1); // "2", a lone atom -- cheap to drop
    graph = addAtomFromStub(graph, "1", "C", 1); // "3", the start of a bigger branch
    graph = addAtomFromStub(graph, "3", "C", 1); // "4", hangs off "3"
    graph = addAtomFromStub(graph, "1", "Cl", 1); // "5" -- "1" now fully saturated (4 used)
    expect(usedValency(findAtomById(graph, "1")!)).toBe(4);

    // Aldehyde's whole fragment has exactly one spare slot in total (the
    // carbon's own implicit H), room for only one of the three substituents.
    // The 2-atom branch ("3" + "4") costs more to drop than either
    // single-atom "2" or "5", so it's the one that should survive.
    graph = replaceAtomWithFunctionalGroup(graph, "1", "aldehyde");

    expect(findAtomById(graph, "3")).toBeDefined();
    expect(findAtomById(graph, "4")).toBeDefined();
    expect(findAtomById(graph, "2")).toBeUndefined();
    expect(findAtomById(graph, "5")).toBeUndefined();
  });

  it("replaces the root seed atom, which has no parent edge, hosting every substituent that fits", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1"

    graph = replaceAtomWithFunctionalGroup(graph, "0", "hydroxyl");

    const oxygen = findAtomById(graph, "0")!;
    expect(oxygen.element).toBe("O");
    expect(oxygen.parentId).toBeUndefined();
    expect(oxygen.bonds).toEqual([{ to: "1", order: 1 }]); // its one spare slot hosts the sole substituent
  });

  it("is a single, atomic transformation -- no partially-mutated graph on the no-op path", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "I", 1); // "1", never a valid target

    const before = graph;
    const after = replaceAtomWithFunctionalGroup(graph, "1", "amide");

    expect(after).toBe(before);
    expect(after.atoms).toHaveLength(2);
  });
});
