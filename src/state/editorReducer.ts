import { createSeedGraph, type BondOrder, type Element, type MoleculeGraph } from "../graph/types";
import {
  addAtomFromStub,
  deleteAtomSubtree,
  deleteBond,
  setAtomElement,
  setBondOrder,
} from "../graph/mutations";

export type Selection =
  | { kind: "atom"; atomId: string }
  | { kind: "bond"; atomIdA: string; atomIdB: string }
  | null;

export interface EditorState {
  graph: MoleculeGraph;
  selection: Selection;
  /** The element/bond-order that the next stub click will place. */
  tool: {
    element: Element;
    bondOrder: BondOrder;
  };
}

export function createInitialState(): EditorState {
  return {
    graph: createSeedGraph(),
    selection: null,
    tool: { element: "C", bondOrder: 1 },
  };
}

export type EditorAction =
  | { type: "GROW_ATOM"; atomId: string; angle: number }
  | { type: "SET_TOOL_ELEMENT"; element: Element }
  | { type: "SET_TOOL_BOND_ORDER"; bondOrder: BondOrder }
  | { type: "SELECT_ATOM"; atomId: string }
  | { type: "SELECT_BOND"; atomIdA: string; atomIdB: string }
  | { type: "CLEAR_SELECTION" }
  | { type: "RETYPE_SELECTED_ATOM"; element: Element }
  | { type: "SET_SELECTED_BOND_ORDER"; order: BondOrder }
  | { type: "DELETE_SELECTION" }
  | { type: "CLEAR_MOLECULE" };

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "GROW_ATOM":
      return {
        ...state,
        graph: addAtomFromStub(
          state.graph,
          action.atomId,
          action.angle,
          state.tool.element,
          state.tool.bondOrder,
        ),
      };

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
      return { ...state, graph: setAtomElement(state.graph, state.selection.atomId, action.element) };
    }

    case "SET_SELECTED_BOND_ORDER": {
      if (state.selection?.kind !== "bond") return state;
      const { atomIdA, atomIdB } = state.selection;
      return { ...state, graph: setBondOrder(state.graph, atomIdA, atomIdB, action.order) };
    }

    case "DELETE_SELECTION": {
      const selection = state.selection;
      if (selection === null) return state;

      if (selection.kind === "atom") {
        if (selection.atomId === state.graph.rootId) return state; // the seed can't be deleted
        return { ...state, graph: deleteAtomSubtree(state.graph, selection.atomId), selection: null };
      }
      return {
        ...state,
        graph: deleteBond(state.graph, selection.atomIdA, selection.atomIdB),
        selection: null,
      };
    }

    case "CLEAR_MOLECULE":
      return { ...state, graph: createSeedGraph(), selection: null };
  }
}
