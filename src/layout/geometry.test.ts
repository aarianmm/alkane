import { describe, expect, it } from "vitest";
import { createSeedGraph } from "../graph/types";
import { addAtomFromStub } from "../graph/mutations";
import { displayed } from "../styles/displayed";
import { BOND_LENGTH, computeGrowthTargets, layoutFromRoot } from "./geometry";

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
});
