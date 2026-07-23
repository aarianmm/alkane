import { describe, expect, it } from "vitest";
import { createSeedGraph } from "../graph/types";
import { addAtomFromStub, addRing } from "../graph/mutations";
import { findRing } from "../graph/queries";
import { displayed } from "../styles/displayed";
import { structural } from "../styles/structural";
import { skeletal } from "../styles/skeletal";
import { angularDistance } from "./hydrogens";
import { angleBetween } from "./rings";
import {
  BOND_LENGTH,
  computeBondAngles,
  computeGrowthTargets,
  computeHydrogenPlacements,
  layoutFromRoot,
} from "./geometry";

function closeTo(actual: number, expected: number) {
  expect(actual).toBeCloseTo(expected, 6);
}

describe("layoutFromRoot", () => {
  it("places the root at the origin", () => {
    const positions = layoutFromRoot(createSeedGraph(), displayed);
    expect(positions.get("0")).toEqual({ x: 0, y: 0 });
  });

  it("places a child one bond length away, at slot 1's angle (straight east from the root)", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1);

    const positions = layoutFromRoot(graph, displayed);
    const child = positions.get("1")!;
    closeTo(child.x, BOND_LENGTH);
    closeTo(child.y, 0);
  });

  it("continues a chain in a straight line — slot 1 always continues the incoming direction", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1", slot 1: due east
    graph = addAtomFromStub(graph, "1", "C", 1); // "2", slot 1: continues east

    const positions = layoutFromRoot(graph, displayed);
    closeTo(positions.get("1")!.x, BOND_LENGTH);
    closeTo(positions.get("1")!.y, 0);
    closeTo(positions.get("2")!.x, BOND_LENGTH * 2);
    closeTo(positions.get("2")!.y, 0);
  });

  it("places a branch perpendicular to the chain (carbon: angleIn +/- 90)", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1", slot 1: east
    graph = addAtomFromStub(graph, "1", "C", 1); // "2", slot 1: continues east
    graph = addAtomFromStub(graph, "1", "C", 1); // "3", slot 2: branch at +90 from east

    const positions = layoutFromRoot(graph, displayed);
    const branch = positions.get("3")!;
    closeTo(branch.x, BOND_LENGTH);
    closeTo(branch.y, BOND_LENGTH);
  });

  it("positions a root's second bond to the west, keeping it a horizontal backbone rather than jogging vertical", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1", root slot 1: east
    graph = addAtomFromStub(graph, graph.rootId, "O", 1); // "2", root slot 2: west

    const positions = layoutFromRoot(graph, displayed);
    expect(positions.get("1")).not.toEqual(positions.get("2"));
    closeTo(positions.get("2")!.x, -BOND_LENGTH);
    closeTo(positions.get("2")!.y, 0);
  });

  it("only branches vertically off the root once both horizontal directions are taken", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1", root slot 1: east
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "2", root slot 2: west
    graph = addAtomFromStub(graph, graph.rootId, "O", 1); // "3", root slot 3: south (vertical branch)

    const positions = layoutFromRoot(graph, displayed);
    closeTo(positions.get("3")!.x, 0);
    closeTo(positions.get("3")!.y, BOND_LENGTH);
  });

  it("bonds straight through a divalent atom (ether case) — its only non-parent slot is the continuation", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"
    graph = addAtomFromStub(graph, "1", "O", 1); // "2", divalent: slot 1 only, straight through
    graph = addAtomFromStub(graph, "2", "C", 1); // "3", continues straight again

    const positions = layoutFromRoot(graph, displayed);
    // C(0)-C(1)-O(2)-C(3) all collinear along the east-pointing chain.
    closeTo(positions.get("0")!.y, 0);
    closeTo(positions.get("1")!.y, 0);
    closeTo(positions.get("2")!.y, 0);
    closeTo(positions.get("3")!.y, 0);
    closeTo(positions.get("3")!.x, BOND_LENGTH * 3);
  });
});

describe("ring layout", () => {
  function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  it("renders every ring bond, including the closing one, at exactly BOND_LENGTH, in every style", () => {
    const graph = addRing(createSeedGraph(), "0", 6, false);
    const ring = findRing(graph)!;

    for (const style of [displayed, structural, skeletal]) {
      const positions = layoutFromRoot(graph, style);
      for (let i = 0; i < ring.length; i++) {
        const a = positions.get(ring[i])!;
        const b = positions.get(ring[(i + 1) % ring.length])!;
        closeTo(distance(a, b), BOND_LENGTH);
      }
    }
  });

  it("places a seed-anchored hexagon with the anchor as the topmost apex", () => {
    const graph = addRing(createSeedGraph(), "0", 6, false);
    const ring = findRing(graph)!;
    const positions = layoutFromRoot(graph, displayed);

    // Anchor at the origin, ring center due south (SVG y-down default), so
    // the anchor is the smallest-y (topmost) point and every other vertex
    // sits below it -- the classic apex-at-top hexagon.
    const anchorY = positions.get(ring[0])!.y;
    for (const id of ring.slice(1)) {
      expect(positions.get(id)!.y).toBeGreaterThan(anchorY);
    }
    closeTo(positions.get(ring[3])!.x, 0); // the opposite vertex is directly below
  });

  it("swings the ring away from an existing chain, not back through it", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1", chain east of the seed
    graph = addRing(graph, graph.rootId, 6, false);

    const positions = layoutFromRoot(graph, displayed);
    const chainAtom = positions.get("1")!;
    const ring = findRing(graph)!;

    // Every ring vertex should be at least as far from the chain atom as the
    // anchor itself is (BOND_LENGTH) -- the ring doesn't fold back over it.
    for (const id of ring) {
      expect(distance(positions.get(id)!, chainAtom)).toBeGreaterThanOrEqual(BOND_LENGTH - 1e-6);
    }
  });

  it("gives a non-anchor ring CH2 two hydrogens, symmetric about its outward radial", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1": gives the ring anchor a parent bond
    graph = addRing(graph, "1", 6, false);
    const ring = findRing(graph)!;
    const positions = layoutFromRoot(graph, displayed);

    const middle = ring[2]; // a plain ring carbon: no parent bond, no substituents
    const hydrogens = computeHydrogenPlacements(graph, displayed).filter((p) => p.atomId === middle);
    expect(hydrogens).toHaveLength(2);

    const center = {
      x: ring.reduce((s, id) => s + positions.get(id)!.x, 0) / ring.length,
      y: ring.reduce((s, id) => s + positions.get(id)!.y, 0) / ring.length,
    };
    const outward = angleBetween(center, positions.get(middle)!);

    closeTo(angularDistance(hydrogens[0].angle, hydrogens[1].angle), 90);
    for (const h of hydrogens) closeTo(angularDistance(h.angle, outward), 45);
  });

  it("gives the ring anchor exactly one hydrogen when it also carries a parent bond", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1": gives the ring anchor a parent bond
    graph = addRing(graph, "1", 6, false);
    const ring = findRing(graph)!;

    const hydrogens = computeHydrogenPlacements(graph, displayed).filter((p) => p.atomId === ring[0]);
    expect(hydrogens).toHaveLength(1);
  });

  it("gives a ring carbon with a grown methyl exactly one hydrogen, not coincident with the methyl", () => {
    let graph = addRing(createSeedGraph(), "0", 6, false);
    const ring = findRing(graph)!;
    graph = addAtomFromStub(graph, ring[1], "C", 1); // methyl substituent off a ring carbon
    const substituentId = graph.atoms.find((a) => a.parentId === ring[1])!.id;

    const hydrogens = computeHydrogenPlacements(graph, displayed).filter((p) => p.atomId === ring[1]);
    expect(hydrogens).toHaveLength(1);

    const positions = layoutFromRoot(graph, displayed);
    const methylAngle = angleBetween(positions.get(ring[1])!, positions.get(substituentId)!);
    expect(angularDistance(hydrogens[0].angle, methylAngle)).toBeGreaterThan(1);
  });

  it("keeps a substituent grown off a ring atom at BOND_LENGTH, outward from the ring", () => {
    let graph = addRing(createSeedGraph(), "0", 6, false);
    const ring = findRing(graph)!;
    graph = addAtomFromStub(graph, ring[1], "C", 1); // methyl substituent off a ring carbon

    const positions = layoutFromRoot(graph, displayed);
    const substituentId = graph.atoms.find((a) => a.parentId === ring[1])!.id;
    const ringAtomPos = positions.get(ring[1])!;
    const substituentPos = positions.get(substituentId)!;

    closeTo(distance(ringAtomPos, substituentPos), BOND_LENGTH);
  });

  it("includes the ring-closing bond in computeBondAngles for both endpoints", () => {
    const graph = addRing(createSeedGraph(), "0", 5, false);
    const ring = findRing(graph)!;
    const bondAngles = computeBondAngles(graph, displayed);

    // The anchor (ring[0]) and the last ring atom are bonded via the closing
    // edge, which isn't a parent/child relationship -- confirm both sides
    // report an angle for it (i.e. more than just their tree-edge angles).
    expect(bondAngles.get(ring[0])!.length).toBeGreaterThanOrEqual(2);
    expect(bondAngles.get(ring[ring.length - 1])!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("computeGrowthTargets", () => {
  it("offers exactly one growth target per atom with an open slot, not every candidate at once", () => {
    const graph = createSeedGraph();
    const targets = computeGrowthTargets(graph, displayed);
    expect(targets).toHaveLength(1);
    expect(targets[0].slot).toBe(1);
  });

  it("reveals the next fixed slot once the current one is filled, without moving it later", () => {
    let graph = createSeedGraph();
    const first = computeGrowthTargets(graph, displayed).find((t) => t.atomId === graph.rootId)!;
    expect(first.slot).toBe(1);

    graph = addAtomFromStub(graph, graph.rootId, "C", 1);
    const rootTargetAfter = computeGrowthTargets(graph, displayed).find((t) => t.atomId === graph.rootId)!;
    expect(rootTargetAfter.slot).toBe(2); // the next fixed slot, not a re-spread set

    // The new child (carbon, non-root) reveals its own single next target too.
    expect(computeGrowthTargets(graph, displayed).filter((t) => t.atomId === "1")).toHaveLength(1);
  });

  it("offers no growth target on an atom with no remaining valency", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "F", 1);
    const targets = computeGrowthTargets(graph, displayed).filter((t) => t.atomId === "1");
    expect(targets).toHaveLength(0);
  });

  it("stops offering a growth target once every slot is filled", () => {
    let graph = createSeedGraph();
    for (let i = 0; i < 4; i++) {
      graph = addAtomFromStub(graph, graph.rootId, "C", 1);
    }
    const targets = computeGrowthTargets(graph, displayed).filter((t) => t.atomId === graph.rootId);
    expect(targets).toHaveLength(0);
  });

  it("offers no growth target once valency is exhausted by bond order, even with a geometric slot still free (a style with no explicit-H guard, e.g. Structural)", () => {
    // Root carbon: a triple bond (uses 3 of 4 valency, 1 geometric slot) plus
    // a single bond (uses the remaining 1 valency, a 2nd geometric slot). All
    // 4 valency is spent, but only 2 of the root's 4 geometric slots are
    // occupied — slots 3 and 4 are still geometrically free, and without the
    // valency guard a non-explicit-H style would wrongly offer them.
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 3); // "1", slot 1
    graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "2", slot 2

    const structuralTargets = computeGrowthTargets(graph, structural).filter((t) => t.atomId === graph.rootId);
    expect(structuralTargets).toHaveLength(0);

    const displayedTargets = computeGrowthTargets(graph, displayed).filter((t) => t.atomId === graph.rootId);
    expect(displayedTargets).toHaveLength(0);
  });
});
