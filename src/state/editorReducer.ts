import { createSeedGraph, PERIODIC_TABLE, type BondOrder, type Element, type MoleculeGraph } from "../graph/types";
import {
  addAtomFromStub,
  addRing,
  deleteAtomSubtree,
  deleteBond,
  replaceAtomWithRing,
  retypeAtomWithPrune,
  setAtomElement,
  setBondOrder,
} from "../graph/mutations";
import { canInsertRing, findAtomById, usedValency } from "../graph/queries";
import { DEFAULT_STYLE, type StyleId } from "../styles";

export type Selection =
  | { kind: "atom"; atomId: string }
  | { kind: "bond"; atomIdA: string; atomIdB: string }
  /** A ring size (and aromaticity) armed from the toolbar, waiting for the next stub click to say where it grows — the same "held, then applied to whatever's clicked" shape as an atom/bond selection, just not pointing at an existing graph element yet. */
  | { kind: "pendingRing"; size: number; aromatic: boolean }
  | null;

interface History {
  past: MoleculeGraph[];
  future: MoleculeGraph[];
}

export interface EditorState {
  graph: MoleculeGraph;
  selection: Selection;
  /** Which of Displayed/Structural/Skeletal renders the graph — switchable via the toolbar's style group. */
  style: StyleId;
  /** The element/bond-order that the next stub click will place. */
  tool: {
    element: Element;
    bondOrder: BondOrder;
  };
  /** Undo/redo only covers the graph — selection and tool are transient UI state, not edits. */
  history: History;
}

export function createInitialState(): EditorState {
  return {
    graph: createSeedGraph(),
    selection: null,
    style: DEFAULT_STYLE,
    tool: { element: "C", bondOrder: 1 },
    history: { past: [], future: [] },
  };
}

export type EditorAction =
  | { type: "GROW_ATOM"; atomId: string }
  | { type: "REPLACE_ATOM"; atomId: string }
  | { type: "SELECT_RING"; size: number; aromatic: boolean }
  | { type: "SET_STYLE"; style: StyleId }
  | { type: "SET_TOOL_ELEMENT"; element: Element }
  | { type: "SET_TOOL_BOND_ORDER"; bondOrder: BondOrder }
  | { type: "SELECT_ATOM"; atomId: string }
  | { type: "SELECT_BOND"; atomIdA: string; atomIdB: string }
  | { type: "CLEAR_SELECTION" }
  | { type: "RETYPE_SELECTED_ATOM"; element: Element }
  | { type: "SET_SELECTED_BOND_ORDER"; order: BondOrder }
  | { type: "DELETE_SELECTION" }
  | { type: "CLEAR_MOLECULE" }
  | { type: "UNDO" }
  | { type: "REDO" };

/** Records the graph as it was just before a mutation, and drops the redo stack since it's now stale. */
function withMutation(state: EditorState, graph: MoleculeGraph, extra: Partial<EditorState> = {}): EditorState {
  return {
    ...state,
    ...extra,
    graph,
    history: { past: [...state.history.past, state.graph], future: [] },
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "GROW_ATOM": {
      // A stub click means "hang the armed ring off this open valence"
      // while one's pending, instead of its usual meaning of growing a
      // single atom from the tool. The clicked atom never joins the ring
      // itself -- a plain carbon grows there first, exactly like any other
      // stub click, and *that* new atom is the ring's anchor. So clicking
      // an H stub on methane yields methylcyclohexane (methane's carbon
      // stays a substituent), not methane's carbon turning into the ring.
      if (state.selection?.kind === "pendingRing") {
        const { size, aromatic } = state.selection;
        const withAnchor = addAtomFromStub(state.graph, action.atomId, "C", 1);
        const anchorId = String(state.graph.nextId);
        if (!canInsertRing(withAnchor, anchorId, aromatic)) return state; // e.g. a ring already exists; stays armed
        return withMutation(state, addRing(withAnchor, anchorId, size, aromatic), { selection: null });
      }
      return withMutation(
        state,
        addAtomFromStub(state.graph, action.atomId, state.tool.element, state.tool.bondOrder),
      );
    }

    // Clicking an existing atom applies whatever's currently armed on the
    // toolbar to it directly -- no pre-selection step required. A pending
    // ring replaces the clicked atom in place (unlike GROW_ATOM's pending-ring
    // handling, which grows a fresh anchor from a stub first); a plain
    // element retypes the atom, pruning whatever branches don't fit the new
    // valency. Bonds/undo/redo all still flow through withMutation.
    case "REPLACE_ATOM": {
      if (state.selection?.kind === "pendingRing") {
        const { size, aromatic } = state.selection;
        const next = replaceAtomWithRing(state.graph, action.atomId, size, aromatic);
        if (next === state.graph) return state; // couldn't fit / not a carbon / ring already exists -- stays armed
        return withMutation(state, next, { selection: null });
      }

      const atom = findAtomById(state.graph, action.atomId);
      if (!atom) return state;
      const { element } = state.tool;
      if (atom.element === element && usedValency(atom) <= PERIODIC_TABLE[element].valency) {
        // Already the armed element and already valid -- nothing to mutate,
        // just make it the active selection.
        return { ...state, selection: { kind: "atom", atomId: action.atomId } };
      }
      return withMutation(state, retypeAtomWithPrune(state.graph, action.atomId, element), {
        selection: { kind: "atom", atomId: action.atomId },
      });
    }

    case "SELECT_RING":
      return { ...state, selection: { kind: "pendingRing", size: action.size, aromatic: action.aromatic } };

    case "SET_STYLE":
      return { ...state, style: action.style };

    case "SET_TOOL_ELEMENT":
      return { ...state, tool: { ...state.tool, element: action.element } };

    case "SET_TOOL_BOND_ORDER":
      return { ...state, tool: { ...state.tool, bondOrder: action.bondOrder } };

    case "SELECT_ATOM":
      return { ...state, selection: { kind: "atom", atomId: action.atomId } };

    case "SELECT_BOND":
      return { ...state, selection: { kind: "bond", atomIdA: action.atomIdA, atomIdB: action.atomIdB } };

    case "CLEAR_SELECTION":
      return state.selection === null ? state : { ...state, selection: null };

    case "RETYPE_SELECTED_ATOM": {
      if (state.selection?.kind !== "atom") return state;
      return withMutation(state, setAtomElement(state.graph, state.selection.atomId, action.element));
    }

    case "SET_SELECTED_BOND_ORDER": {
      if (state.selection?.kind !== "bond") return state;
      const { atomIdA, atomIdB } = state.selection;
      return withMutation(state, setBondOrder(state.graph, atomIdA, atomIdB, action.order));
    }

    case "DELETE_SELECTION": {
      const selection = state.selection;
      if (selection === null) return state;

      if (selection.kind === "atom") {
        if (selection.atomId === state.graph.rootId) return state; // the seed can't be deleted
        return withMutation(state, deleteAtomSubtree(state.graph, selection.atomId), { selection: null });
      }
      if (selection.kind === "bond") {
        return withMutation(state, deleteBond(state.graph, selection.atomIdA, selection.atomIdB), { selection: null });
      }
      // pendingRing: nothing in the graph to delete yet -- Delete just cancels the arm, same as Escape.
      return { ...state, selection: null };
    }

    case "CLEAR_MOLECULE":
      return withMutation(state, createSeedGraph(), { selection: null });

    case "UNDO": {
      const { past, future } = state.history;
      if (past.length === 0) return state;
      const graph = past[past.length - 1];
      return {
        ...state,
        graph,
        selection: null,
        history: { past: past.slice(0, -1), future: [state.graph, ...future] },
      };
    }

    case "REDO": {
      const { past, future } = state.history;
      if (future.length === 0) return state;
      const graph = future[0];
      return {
        ...state,
        graph,
        selection: null,
        history: { past: [...past, state.graph], future: future.slice(1) },
      };
    }
  }
}
