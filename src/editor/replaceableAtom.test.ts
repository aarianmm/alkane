import { describe, expect, it } from "vitest";
import { isReplaceableAtom } from "./replaceableAtom";
import { createSeedGraph } from "../graph/types";
import { addAtomFromStub, addRing, replaceAtomWithRing, retypeAtomWithPrune } from "../graph/mutations";
import { replaceAtomWithFunctionalGroup } from "../graph/functionalGroups";
import { findAtomById } from "../graph/queries";
import type { Selection } from "../state/editorReducer";

/** The canvas offers an atom as a target; pressing it runs the matching mutation. Both must agree, or the UI advertises something that then silently does nothing. */
function wouldChangeGraph(
  graph: ReturnType<typeof createSeedGraph>,
  selection: Selection,
  armedElement: Parameters<typeof retypeAtomWithPrune>[2],
  atomId: string,
): boolean {
  if (selection?.kind === "pendingRing") {
    return replaceAtomWithRing(graph, atomId, selection.aromatic ? 6 : 3, selection.aromatic) !== graph;
  }
  if (selection?.kind === "pendingGroup") {
    return replaceAtomWithFunctionalGroup(graph, atomId, selection.groupId) !== graph;
  }
  return retypeAtomWithPrune(graph, atomId, armedElement) !== graph;
}

describe("isReplaceableAtom", () => {
  it("stops offering an element the target's parent bond can't carry", () => {
    // The bug this guards: the canvas used to mark any atom of a different
    // element as replaceable, so pressing a double-bonded carbon with iodine
    // armed produced a valency-1 atom still holding a double bond.
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 2); // "1", double-bonded to root

    expect(isReplaceableAtom(graph, null, "I", "1", "C")).toBe(false);
    expect(isReplaceableAtom(graph, null, "O", "1", "C")).toBe(true); // valency 2 -- fits exactly
  });

  it("still treats a same-element press as a no-op", () => {
    const graph = createSeedGraph();

    expect(isReplaceableAtom(graph, null, "C", "0", "C")).toBe(false);
  });

  it("stops offering a ring on a non-carbon, or once a ring already exists", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "O", 1); // "1"
    const pendingRing: Selection = { kind: "pendingRing", size: 6, aromatic: false };

    expect(isReplaceableAtom(graph, pendingRing, "C", "1", "O")).toBe(false);
    expect(isReplaceableAtom(graph, pendingRing, "C", "0", "C")).toBe(true);

    const withRing = addRing(createSeedGraph(), "0", 6, false);
    expect(isReplaceableAtom(withRing, pendingRing, "C", "0", "C")).toBe(false);
  });

  it("stops offering an aromatic ring where only a plain one fits", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 2); // "1": 2 slots left -- enough for a plain ring, not Kekule's 3

    expect(isReplaceableAtom(graph, { kind: "pendingRing", size: 3, aromatic: false }, "C", "1", "C")).toBe(true);
    expect(isReplaceableAtom(graph, { kind: "pendingRing", size: 6, aromatic: true }, "C", "1", "C")).toBe(false);
  });

  it("agrees with the mutation it stands for, across every armed tool and target", () => {
    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, "0", "C", 2); // "1", double-bonded carbon
    graph = addAtomFromStub(graph, "0", "Cl", 1); // "2", a halogen
    graph = addAtomFromStub(graph, "0", "C", 1); // "3", a plain single-bonded carbon

    const selections: Selection[] = [
      null,
      { kind: "pendingRing", size: 3, aromatic: false },
      { kind: "pendingRing", size: 6, aromatic: true },
      { kind: "pendingGroup", groupId: "carboxylicAcid" },
      { kind: "pendingGroup", groupId: "nitro" },
      { kind: "pendingGroup", groupId: "methoxy" },
    ];

    for (const selection of selections) {
      for (const armedElement of ["O", "N", "I"] as const) {
        for (const atomId of ["0", "1", "2", "3"]) {
          const atomElement = findAtomById(graph, atomId)!.element;
          expect(
            isReplaceableAtom(graph, selection, armedElement, atomId, atomElement),
            `selection=${selection?.kind ?? "element"} armed=${armedElement} atom=${atomId}`,
          ).toBe(wouldChangeGraph(graph, selection, armedElement, atomId));
        }
      }
    }
  });
});
