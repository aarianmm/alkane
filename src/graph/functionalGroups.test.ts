import { describe, expect, it } from "vitest";
import { createSeedGraph, PERIODIC_TABLE } from "./types";
import { addAtomFromStub, addRing } from "./mutations";
import { bondOrderBetween, findAtomById, findRing, openSlotCount, usedValency } from "./queries";
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
      ["acylChloride", "amide", "carbonyl", "carboxylicAcid", "methoxy", "nitrile", "nitro"].sort(),
    );
    expect(new Set(FUNCTIONAL_GROUP_IDS).size).toBe(FUNCTIONAL_GROUP_IDS.length);
    expect(FUNCTIONAL_GROUP_IDS.sort()).toEqual(ids);
  });

  it("every group is grown correctly off a fresh stub, atom-for-atom and bond-for-bond", () => {
    const expected: Record<FunctionalGroupId, { atomCount: number; elements: string[] }> = {
      carbonyl: { atomCount: 2, elements: ["C", "O"] },
      carboxylicAcid: { atomCount: 3, elements: ["C", "O", "O"] },
      acylChloride: { atomCount: 3, elements: ["C", "O", "Cl"] },
      amide: { atomCount: 3, elements: ["C", "O", "N"] },
      nitrile: { atomCount: 2, elements: ["C", "N"] },
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

  it("every group adds more than one heavy atom -- single-atom groups are left to the element tool", () => {
    // The whole reason this vocabulary exists is that these shapes take
    // several clicks to build by hand. Anything that's just one heavy atom
    // hung off another (-OH, -SH, -NH2, a bare carbonyl -O) is already a
    // one-click gesture with the element and bond-order tools, so it must
    // not reappear here.
    for (const groupId of FUNCTIONAL_GROUP_IDS) {
      expect(FUNCTIONAL_GROUPS[groupId].atoms.length).toBeGreaterThan(1);
    }
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
    const graph = addFunctionalGroupFromStub(createSeedGraph(), "0", "methoxy");
    expect(graph.atoms).toHaveLength(3); // the seed carbon plus methoxy's O and CH3
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

    const result = addFunctionalGroupFromStub(graph, "0", "methoxy");

    expect(result).toBe(graph);
  });

  it("throws when the parent atom doesn't exist", () => {
    expect(() => addFunctionalGroupFromStub(createSeedGraph(), "missing", "methoxy")).toThrow();
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
    expect(canReplaceWithGroup(graph, "1", "methoxy")).toBe(false);
  });

  it("accepts a double-bonded parent edge only where the attachment atom has room to spare", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 2); // "1", double-bonded to its parent

    // Carbonyl's carbon spends only 2 of its 4 slots on its own =O, so it is
    // the single group here that can carry a parent bond above order 1.
    // Every other group spends all but one slot internally (carboxylic
    // acid's =O + -OH, nitrile's triple bond, methoxy's -CH3), leaving room
    // for a single bond and nothing more.
    expect(canReplaceWithGroup(graph, "1", "carbonyl")).toBe(true);

    for (const groupId of FUNCTIONAL_GROUP_IDS.filter((id) => id !== "carbonyl")) {
      expect(canReplaceWithGroup(graph, "1", groupId)).toBe(false);
    }
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
    expect(canReplaceWithGroup(createSeedGraph(), "missing", "methoxy")).toBe(false);
  });
});

describe("replaceAtomWithFunctionalGroup", () => {
  it("replaces a plain carbon in place, preserving its parent edge", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1"

    graph = replaceAtomWithFunctionalGroup(graph, "1", "methoxy");

    const atom = findAtomById(graph, "1")!;
    expect(atom.element).toBe("O");
    expect(atom.bonds.some((b) => b.to === "0" && b.order === 1)).toBe(true); // parent edge preserved
    expect(atom.bonds).toHaveLength(2); // plus the group's own methyl carbon
  });

  it("is a no-op, returning the graph unchanged, through an invalid target", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "I", 1); // "1"

    const result = replaceAtomWithFunctionalGroup(graph, "1", "carboxylicAcid");

    expect(result).toBe(graph);
  });

  it("retains a substituent off a non-root target only where the group leaves a slot for one", () => {
    // Carbonyl's carbon has 4 slots, 2 spent on its own =O: one for the
    // parent edge and one left over, which is precisely the difference
    // between an aldehyde and a ketone. Every other group is exactly
    // saturated by its own bonds plus the parent edge, so on any atom that
    // *has* a parent edge there is no room to retain anything. (Replacing
    // the root seed atom is the general exception -- no parent edge, so one
    // more slot free; see the root-replacement cases below.)
    for (const groupId of FUNCTIONAL_GROUP_IDS) {
      let graph = createSeedGraph();
      graph = addAtomFromStub(graph, "0", "C", 1); // "1", target
      graph = addAtomFromStub(graph, "1", "F", 1); // "2", its lone substituent

      const replaced = replaceAtomWithFunctionalGroup(graph, "1", groupId);

      expect(findAtomById(replaced, "1")!.bonds.some((b) => b.to === "0")).toBe(true); // parent edge kept
      expect(findAtomById(replaced, "2") !== undefined).toBe(groupId === "carbonyl");
    }
  });

  it("carbonyl is the general C=O: a ketone when it keeps a second carbon, an aldehyde when it doesn't", () => {
    // Same group, same call -- which molecule it is depends only on what the
    // target already carried, which is why the vocabulary names the group
    // rather than either product.
    let ketone = createSeedGraph();
    ketone = addAtomFromStub(ketone, "0", "C", 1); // "1", target
    ketone = addAtomFromStub(ketone, "1", "C", 1); // "2", the second carbon

    ketone = replaceAtomWithFunctionalGroup(ketone, "1", "carbonyl");

    const ketoneCarbon = findAtomById(ketone, "1")!;
    expect(ketoneCarbon.element).toBe("C");
    expect(usedValency(ketoneCarbon)).toBe(4); // parent + retained carbon + the =O
    expect(openSlotCount(ketoneCarbon)).toBe(0); // no implicit H: a ketone
    expect(findAtomById(ketone, "2")).toBeDefined();

    let aldehyde = createSeedGraph();
    aldehyde = addAtomFromStub(aldehyde, "0", "C", 1); // "1", target with nothing else on it

    aldehyde = replaceAtomWithFunctionalGroup(aldehyde, "1", "carbonyl");

    const aldehydeCarbon = findAtomById(aldehyde, "1")!;
    expect(usedValency(aldehydeCarbon)).toBe(3); // parent + the =O
    expect(openSlotCount(aldehydeCarbon)).toBe(1); // that lone open slot is the aldehyde's H
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

  it("never relocates a displaced substituent onto a non-attachment atom of the new group -- it's retained on the attachment atom if it fits, otherwise dropped entirely", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1", target
    graph = addAtomFromStub(graph, "1", "F", 1); // "2"
    graph = addAtomFromStub(graph, "1", "Cl", 1); // "3" -- "1" has parent(1) + F(1) + Cl(1) = 3 used, 1 open

    // Methoxy's own O-attachment already spends its only other slot on the
    // group's own -CH3, leaving no room for either halogen -- both are
    // dropped, and in particular neither ends up bonded to the methyl carbon.
    graph = replaceAtomWithFunctionalGroup(graph, "1", "methoxy");

    const oxygen = findAtomById(graph, "1")!;
    expect(oxygen.element).toBe("O");
    expect(oxygen.bonds).toHaveLength(2); // parent + the methyl carbon, nothing else fits

    const methylId = oxygen.bonds.find((b) => b.to !== "0")!.to;
    const methyl = findAtomById(graph, methylId)!;
    expect(methyl.bonds).toHaveLength(1); // only its bond back to the oxygen -- no halogen landed here
    expect(findAtomById(graph, "2")).toBeUndefined();
    expect(findAtomById(graph, "3")).toBeUndefined();
  });

  it("drops every other substituent when the group's own internal bonds leave room for only the parent edge (carboxylic acid)", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1", target carbon
    graph = addAtomFromStub(graph, "1", "F", 1); // "2"
    graph = addAtomFromStub(graph, "1", "Cl", 1); // "3"
    graph = addAtomFromStub(graph, "1", "Br", 1); // "4" -- "1" now fully saturated (4 used)

    // Carboxylic acid's carbon already spends 3 of its 4 slots on the
    // group's own =O and -OH, leaving room for only the parent edge.
    const replaced = replaceAtomWithFunctionalGroup(graph, "1", "carboxylicAcid");

    const carbon = findAtomById(replaced, "1")!;
    expect(carbon.element).toBe("C");
    expect(carbon.bonds.map((b) => b.order).sort()).toEqual([1, 1, 2]);
    expect(usedValency(carbon)).toBe(4);
    expect(carbon.bonds.some((b) => b.to === "0")).toBe(true); // parent edge kept
    expect(findAtomById(replaced, "2")).toBeUndefined();
    expect(findAtomById(replaced, "3")).toBeUndefined();
    expect(findAtomById(replaced, "4")).toBeUndefined();
  });

  it("drops the cheapest branches first when only one substituent can survive", () => {
    // The root seed atom has no parent edge, so replacing it leaves methoxy's
    // oxygen exactly one spare slot (valency 2, one of which its own -CH3
    // takes) -- room for one of the three substituents below. The 2-atom
    // branch ("2" + "3") costs more to drop than either single-atom "1" or
    // "4", so it's the one that should survive.
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "F", 1); // "1", a lone atom -- cheap to drop
    graph = addAtomFromStub(graph, "0", "C", 1); // "2", the start of a bigger branch
    graph = addAtomFromStub(graph, "2", "C", 1); // "3", hangs off "2"
    graph = addAtomFromStub(graph, "0", "Cl", 1); // "4", also cheap
    expect(usedValency(findAtomById(graph, "0")!)).toBe(3);

    graph = replaceAtomWithFunctionalGroup(graph, "0", "methoxy");

    expect(findAtomById(graph, "2")).toBeDefined();
    expect(findAtomById(graph, "3")).toBeDefined();
    expect(findAtomById(graph, "1")).toBeUndefined();
    expect(findAtomById(graph, "4")).toBeUndefined();
  });

  it("replaces the root seed atom, which has no parent edge, hosting every substituent that fits", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1"

    graph = replaceAtomWithFunctionalGroup(graph, "0", "methoxy");

    const oxygen = findAtomById(graph, "0")!;
    expect(oxygen.element).toBe("O");
    expect(oxygen.parentId).toBeUndefined();
    // No parent edge to carry, so of the oxygen's two slots one goes to the
    // group's own methyl and the other is free to keep the substituent.
    expect(oxygen.bonds).toHaveLength(2);
    expect(oxygen.bonds).toContainEqual({ to: "1", order: 1 });
    expect(findAtomById(graph, "1")!.element).toBe("C");
  });

  it("is a single, atomic transformation -- no partially-mutated graph on the no-op path", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "I", 1); // "1", never a valid target

    const before = graph;
    const after = replaceAtomWithFunctionalGroup(graph, "1", "amide");

    expect(after).toBe(before);
    expect(after.atoms).toHaveLength(2);
  });

  it("leaves every bond symmetric and every atom's valency legal (nitro's nitrogen excepted), across every group in the vocabulary", () => {
    for (const groupId of FUNCTIONAL_GROUP_IDS) {
      let graph = createSeedGraph();
      graph = addAtomFromStub(graph, "0", "C", 1); // "1", target carbon
      graph = addAtomFromStub(graph, "1", "F", 1); // "2"
      graph = addAtomFromStub(graph, "1", "Cl", 1); // "3"
      graph = addAtomFromStub(graph, "1", "Br", 1); // "4" -- "1" fully saturated

      const replaced = replaceAtomWithFunctionalGroup(graph, "1", groupId);

      for (const atom of replaced.atoms) {
        for (const bond of atom.bonds) {
          const neighbor = findAtomById(replaced, bond.to)!;
          expect(neighbor.bonds.some((b) => b.to === atom.id && b.order === bond.order)).toBe(true);
        }
        if (groupId === "nitro" && atom.element === "N" && atom.id !== "0") {
          expect(usedValency(atom)).toBe(5); // the one legal hypervalent case
          continue;
        }
        expect(usedValency(atom)).toBeLessThanOrEqual(PERIODIC_TABLE[atom.element].valency);
      }
    }
  });
});

describe("Rule A -- a replace must not break the ring", () => {
  it("lets carbonyl land on a plain ring carbon, keeping all six ring carbons intact", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1", anchor
    graph = addRing(graph, "1", 6, false); // ring carbons "1".."6"

    expect(canReplaceWithGroup(graph, "3", "carbonyl")).toBe(true);
    const replaced = replaceAtomWithFunctionalGroup(graph, "3", "carbonyl");

    const ring = findRing(replaced)!;
    expect(ring).toHaveLength(6);
    expect(ring).toContain("3");
    const carbon = findAtomById(replaced, "3")!;
    expect(carbon.element).toBe("C");
    expect(carbon.bonds.some((b) => b.order === 2)).toBe(true); // the new =O
    expect(bondOrderBetween(replaced, "3", "2")).toBe(1);
    expect(bondOrderBetween(replaced, "3", "4")).toBe(1);
  });

  it("declines carboxylic acid on a ring carbon -- its own =O/-OH leave no room for both ring bonds", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1", anchor
    graph = addRing(graph, "1", 6, false);

    expect(canReplaceWithGroup(graph, "3", "carboxylicAcid")).toBe(false);
    expect(replaceAtomWithFunctionalGroup(graph, "3", "carboxylicAcid")).toBe(graph);
  });

  it("declines carbonyl on a benzene carbon -- the aromatic single+double ring bonds already sum to 3", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1", anchor
    graph = addRing(graph, "1", 6, true); // aromatic

    expect(canReplaceWithGroup(graph, "3", "carbonyl")).toBe(false);
    expect(replaceAtomWithFunctionalGroup(graph, "3", "carbonyl")).toBe(graph);
  });

  it("prunes a substituent on a ring carbon before touching either ring bond", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 1); // "1", anchor
    graph = addRing(graph, "1", 6, false);
    graph = addAtomFromStub(graph, "3", "C", 1); // "7", a methyl substituent on ring carbon "3"

    const replaced = replaceAtomWithFunctionalGroup(graph, "3", "carbonyl");

    const ring = findRing(replaced)!;
    expect(ring).toHaveLength(6);
    expect(ring).toContain("3");
    expect(findAtomById(replaced, "7")).toBeUndefined(); // methyl pruned, not a ring bond
    expect(bondOrderBetween(replaced, "3", "2")).toBe(1);
    expect(bondOrderBetween(replaced, "3", "4")).toBe(1);
  });
});

describe("Rule B -- a replace must not make the molecule inorganic", () => {
  it("declines nitro onto a lone carbon, which would leave the molecule with no carbon at all", () => {
    const graph = createSeedGraph(); // just "0"

    expect(canReplaceWithGroup(graph, "0", "nitro")).toBe(false);
    expect(replaceAtomWithFunctionalGroup(graph, "0", "nitro")).toBe(graph);
  });
});
