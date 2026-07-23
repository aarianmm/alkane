import { describe, expect, it } from "vitest";
import { createSeedGraph } from "./types";
import { addAtomFromStub, setAtomElement, setBondOrder } from "./mutations";
import { diffGraphs } from "./preview";

describe("diffGraphs", () => {
  it("reports no changes for identical graphs", () => {
    const graph = createSeedGraph();
    const diff = diffGraphs(graph, graph);

    expect(diff.addedAtomIds.size).toBe(0);
    expect(diff.changedAtomIds.size).toBe(0);
    expect(diff.changedBonds).toEqual([]);
  });

  it("reports the new atom and new bond a stub grow would add", () => {
    const base = createSeedGraph();
    const preview = addAtomFromStub(base, base.rootId, "O", 1);

    const diff = diffGraphs(base, preview);

    expect(diff.addedAtomIds).toEqual(new Set(["1"]));
    expect(diff.changedAtomIds.size).toBe(0);
    expect(diff.changedBonds).toHaveLength(1);
    expect(diff.changedBonds[0]).toMatchObject({ atomIdA: "0", atomIdB: "1", order: 1 });
  });

  it("reports only the single new atom two hops out, not the whole branch", () => {
    let base = createSeedGraph();
    base = addAtomFromStub(base, base.rootId, "C", 1); // "1"
    const preview = addAtomFromStub(base, "1", "C", 1); // "2"

    const diff = diffGraphs(base, preview);

    expect(diff.addedAtomIds).toEqual(new Set(["2"]));
    expect(diff.changedBonds).toHaveLength(1);
    expect(diff.changedBonds[0]).toMatchObject({ atomIdA: "1", atomIdB: "2", order: 1 });
  });

  it("reports an atom whose element changed, with no added atoms or bonds", () => {
    const base = addAtomFromStub(createSeedGraph(), "0", "C", 1);
    const preview = setAtomElement(base, "0", "N");

    const diff = diffGraphs(base, preview);

    expect(diff.addedAtomIds.size).toBe(0);
    expect(diff.changedAtomIds).toEqual(new Set(["0"]));
    expect(diff.changedBonds).toEqual([]);
  });

  it("reports a bond whose order changed, keyed the same way regardless of argument order", () => {
    const base = addAtomFromStub(createSeedGraph(), "0", "C", 1);
    const preview = setBondOrder(base, "1", "0", 2);

    const diff = diffGraphs(base, preview);

    expect(diff.addedAtomIds.size).toBe(0);
    expect(diff.changedAtomIds.size).toBe(0);
    expect(diff.changedBonds).toHaveLength(1);
    expect(diff.changedBonds[0]).toMatchObject({ key: "0-1", atomIdA: "0", atomIdB: "1", order: 2 });
  });

  it("reports nothing when the preview graph is the same reference reused", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1);
    const diff = diffGraphs(graph, graph);

    expect(diff.addedAtomIds.size).toBe(0);
    expect(diff.changedAtomIds.size).toBe(0);
    expect(diff.changedBonds).toEqual([]);
  });
});
