import { createSeedGraph, type BondOrder, type Element, type MoleculeGraph } from "../graph/types";
import {
  addAtomFromStub,
  deleteAtomSubtree,
  deleteBond,
  setAtomElement,
  setBondOrder,
} from "../graph/mutations";
import { DEFAULT_STYLE, type StyleId } from "../styles";

export type Selection =
  | { kind: "atom"; atomId: string }
  | { kind: "bond"; atomIdA: string; atomIdB: string }
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
    case "GROW_ATOM":
      return withMutation(
        state,
        addAtomFromStub(state.graph, action.atomId, state.tool.element, state.tool.bondOrder),
      );

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
      return withMutation(state, deleteBond(state.graph, selection.atomIdA, selection.atomIdB), { selection: null });
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
