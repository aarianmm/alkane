import { canReplaceWithGroup } from "../graph/functionalGroups";
import { canReplaceAtomWithRing, canRetypeAtom } from "../graph/mutations";
import type { Element, MoleculeGraph } from "../graph/types";
import type { Selection } from "../state/editorReducer";

/**
 * Whether pressing `atomId` right now would actually change anything --
 * what the canvas uses to decide whether to offer an atom as a replacement
 * target at all.
 *
 * Extracted from MoleculeEditor so it can be tested directly: the test
 * environment is `node`, with no DOM to render into (same reason
 * ringMenuLabel and groupMenuLabel live on their own).
 *
 * All three armed tools ask the same two questions -- is this a legal host,
 * and would it be a no-op -- and every one of them now settles the first
 * through the shared occupant-footprint arithmetic. Only the no-op half
 * differs: a ring or a group is never "already there" to begin with, whereas
 * an atom that's already the armed element has nothing to do.
 */
export function isReplaceableAtom(
  graph: MoleculeGraph,
  selection: Selection,
  armedElement: Element,
  atomId: string,
  atomElement: Element,
): boolean {
  if (selection?.kind === "pendingRing") {
    return canReplaceAtomWithRing(graph, atomId, selection.aromatic);
  }
  if (selection?.kind === "pendingGroup") {
    return canReplaceWithGroup(graph, atomId, selection.groupId);
  }
  return atomElement !== armedElement && canRetypeAtom(graph, atomId, armedElement);
}
