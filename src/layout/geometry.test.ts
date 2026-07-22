import { describe, expect, it } from "vitest";
import { createSeedGraph } from "../graph/types";
import { addAtomFromStub } from "../graph/mutations";
import { BOND_LENGTH, computeOpenStubs, layoutFromRoot, stubCandidateAngles } from "./geometry";

function closeTo(actual: number, expected: number) {
  expect(actual).toBeCloseTo(expected, 6);
}

describe("layoutFromRoot", () => {
  it("places the root at the origin", () => {
    const positions = layoutFromRoot(createSeedGraph());
    expect(positions.get("0")).toEqual({ x: 0, y: 0 });
  });

  it("places a child one bond length away, at its stored angle", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, 0, "C", 1);

    const positions = layoutFromRoot(graph);
    const child = positions.get("1")!;
    closeTo(child.x, BOND_LENGTH);
    closeTo(child.y, 0);
  });

  it("respects each atom's own stored angle independently (a zig-zag chain)", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, -30, "C", 1); // "1"
    graph = addAtomFromStub(graph, "1", 30, "C", 1); // "2"

    const positions = layoutFromRoot(graph);
    const first = positions.get("1")!;
    const second = positions.get("2")!;

    closeTo(first.x, BOND_LENGTH * Math.cos((-30 * Math.PI) / 180));
    closeTo(first.y, BOND_LENGTH * Math.sin((-30 * Math.PI) / 180));
    closeTo(second.x, first.x + BOND_LENGTH * Math.cos((30 * Math.PI) / 180));
    closeTo(second.y, first.y + BOND_LENGTH * Math.sin((30 * Math.PI) / 180));
  });

  it("positions branches independently off the same parent", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, 0, "C", 1); // "1"
    graph = addAtomFromStub(graph, graph.rootId, 90, "O", 1); // "2"

    const positions = layoutFromRoot(graph);
    expect(positions.get("1")).not.toEqual(positions.get("2"));
    closeTo(positions.get("2")!.y, BOND_LENGTH);
  });
});

describe("stubCandidateAngles", () => {
  it("gives the root one candidate per unit of valency (no parent to reserve)", () => {
    const graph = createSeedGraph();
    expect(stubCandidateAngles(graph, graph.rootId)).toHaveLength(4);
  });

  it("reserves one direction for the parent bond on non-root atoms", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, 0, "C", 1);
    expect(stubCandidateAngles(graph, "1")).toHaveLength(3);
  });

  it("gives a halogen zero further candidates (valency 1, fully used by its parent bond)", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, 0, "F", 1);
    expect(stubCandidateAngles(graph, "1")).toHaveLength(0);
  });
});

describe("computeOpenStubs", () => {
  it("offers exactly one stub per atom with an open slot, not every candidate at once", () => {
    const graph = createSeedGraph();
    const stubs = computeOpenStubs(graph, layoutFromRoot(graph));
    expect(stubs).toHaveLength(1);
    expect(stubs[0].angle).toBe(stubCandidateAngles(graph, graph.rootId)[0]);
  });

  it("reveals the next fixed candidate once the current one is filled, without moving it later", () => {
    let graph = createSeedGraph();
    const candidates = stubCandidateAngles(graph, graph.rootId);
    const first = computeOpenStubs(graph, layoutFromRoot(graph))[0];
    expect(first.angle).toBe(candidates[0]);

    graph = addAtomFromStub(graph, graph.rootId, first.angle, "C", 1);
    const rootStubAfter = computeOpenStubs(graph, layoutFromRoot(graph)).find(
      (s) => s.atomId === graph.rootId,
    )!;
    expect(rootStubAfter.angle).toBe(candidates[1]); // the next fixed slot, not a re-spread set

    // The new child (carbon, non-root) reveals its own single next stub too.
    expect(computeOpenStubs(graph, layoutFromRoot(graph)).filter((s) => s.atomId === "1")).toHaveLength(1);
  });

  it("offers no stub on an atom with no remaining valency", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, 0, "F", 1);
    const stubs = computeOpenStubs(graph, layoutFromRoot(graph)).filter((s) => s.atomId === "1");
    expect(stubs).toHaveLength(0);
  });

  it("stops offering a stub once every candidate slot is filled", () => {
    let graph = createSeedGraph();
    for (let i = 0; i < 4; i++) {
      const next = computeOpenStubs(graph, layoutFromRoot(graph)).find((s) => s.atomId === graph.rootId)!;
      graph = addAtomFromStub(graph, graph.rootId, next.angle, "C", 1);
    }
    const stubs = computeOpenStubs(graph, layoutFromRoot(graph)).filter((s) => s.atomId === graph.rootId);
    expect(stubs).toHaveLength(0);
  });
});
