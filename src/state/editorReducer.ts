import { createSeedGraph, PERIODIC_TABLE, type BondOrder, type Element, type MoleculeGraph } from "../graph/types";
import {
  addAtomFromStub,
  addRing,
  decrementBondOrder,
  deleteAtomSubtree,
  replaceAtomWithRing,
  retypeAtomWithPrune,
  setBondOrderWithPrune,
} from "../graph/mutations";
import {
  bondOrderBetween,
  canInsertRing,
  clampStubBondOrder,
  findAtomById,
  openSlotCount,
  usedValency,
} from "../graph/queries";
import { DEFAULT_STYLE, type StyleId } from "../styles";

export type Selection =
  /** A ring size (and aromaticity) armed from the toolbar, waiting for the next stub click to say where it grows. There's no other kind of selection -- an atom or bond is never "selected", only ever pressed, which applies the armed tool directly. */
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
  /**
   * Click-to-delete mode: while on, activating an atom or bond deletes (or,
   * for a bond, decrements) it directly. Entered via the Delete/Backspace
   * key, or the toolbar's Delete button; exited via Escape, toggling that
   * button again, or automatically after the next atom/bond delete.
   */
  deleteMode: boolean;
  /** Undo/redo only covers the graph — selection and tool are transient UI state, not edits. */
  history: History;
}

export function createInitialState(): EditorState {
  return {
    graph: createSeedGraph(),
    selection: null,
    style: DEFAULT_STYLE,
    tool: { element: "C", bondOrder: 1 },
    deleteMode: false,
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
  | { type: "REPLACE_BOND"; atomIdA: string; atomIdB: string }
  | { type: "CLEAR_SELECTION" }
  | { type: "TOGGLE_DELETE_MODE" }
  | { type: "EXIT_DELETE_MODE" }
  | { type: "DELETE_ATOM_AT"; atomId: string }
  | { type: "DELETE_BOND_AT"; atomIdA: string; atomIdB: string }
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
        // The anchor is a fresh carbon, so its own valency (4) leaves only
        // 4 minus whatever the ring itself must reserve (3 for aromatic, 2
        // otherwise) free for the link back to the clicked stub -- on top of
        // whatever the clicked atom's open slots already cap it at.
        const parent = findAtomById(state.graph, action.atomId);
        const anchorLinkMaxOrder = PERIODIC_TABLE.C.valency - (aromatic ? 3 : 2);
        const linkOrder = parent
          ? clampStubBondOrder(state.tool.bondOrder, openSlotCount(parent), anchorLinkMaxOrder)
          : state.tool.bondOrder;
        const withAnchor = addAtomFromStub(state.graph, action.atomId, "C", linkOrder);
        const anchorId = String(state.graph.nextId);
        if (!canInsertRing(withAnchor, anchorId, aromatic)) return state; // e.g. a ring already exists; stays armed
        return withMutation(state, addRing(withAnchor, anchorId, size, aromatic), { selection: null });
      }

      // Clamp so the armed order can never make either end of the new bond
      // hypervalent -- growing with a triple bond armed against an atom with
      // only one open slot silently gives a single bond instead, rather than
      // an illegal atom.
      const parent = findAtomById(state.graph, action.atomId);
      const order = parent
        ? clampStubBondOrder(state.tool.bondOrder, openSlotCount(parent), PERIODIC_TABLE[state.tool.element].valency)
        : state.tool.bondOrder;
      return withMutation(state, addAtomFromStub(state.graph, action.atomId, state.tool.element, order));
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
        // Already the armed element and already valid -- true no-op.
        return state;
      }
      return withMutation(state, retypeAtomWithPrune(state.graph, action.atomId, element));
    }

    case "SELECT_RING":
      return { ...state, selection: { kind: "pendingRing", size: action.size, aromatic: action.aromatic } };

    case "SET_STYLE":
      return { ...state, style: action.style };

    // Arming an element un-arms any pending ring -- an atom and a ring are
    // both things the user "holds" for the next stub/atom click, and only
    // one can be held at a time.
    case "SET_TOOL_ELEMENT":
      return { ...state, tool: { ...state.tool, element: action.element }, selection: null };

    case "SET_TOOL_BOND_ORDER":
      return { ...state, tool: { ...state.tool, bondOrder: action.bondOrder } };

    // Clicking an existing bond applies whatever bond order is currently
    // armed on the toolbar to it directly -- the same "click applies the
    // tool" shape as REPLACE_ATOM. Valency is kept legal via
    // setBondOrderWithPrune, which prunes a branch on an endpoint only if
    // raising the order needs more room than its open (implicit-hydrogen)
    // slots provide.
    case "REPLACE_BOND": {
      const { atomIdA, atomIdB } = action;
      const order = bondOrderBetween(state.graph, atomIdA, atomIdB);
      if (order === undefined) return state; // no such bond

      if (order === state.tool.bondOrder) {
        // Already the armed order -- true no-op.
        return state;
      }

      const next = setBondOrderWithPrune(state.graph, atomIdA, atomIdB, state.tool.bondOrder);
      if (next === state.graph) return state; // degenerate: can't fit without cutting the edited bond
      return withMutation(state, next);
    }

    case "CLEAR_SELECTION":
      return state.selection === null ? state : { ...state, selection: null };

    case "TOGGLE_DELETE_MODE":
      return { ...state, deleteMode: !state.deleteMode, selection: null };

    case "EXIT_DELETE_MODE":
      return state.deleteMode ? { ...state, deleteMode: false } : state;

    case "DELETE_ATOM_AT": {
      if (action.atomId === state.graph.rootId) return state; // the seed can't be deleted
      return withMutation(state, deleteAtomSubtree(state.graph, action.atomId), { deleteMode: false });
    }

    case "DELETE_BOND_AT": {
      const { atomIdA, atomIdB } = action;
      const graph = decrementBondOrder(state.graph, atomIdA, atomIdB);
      // Only exit delete mode once the bond is actually gone -- a decrement
      // that merely weakens a multi-order bond leaves it clickable again.
      const bondRemoved = !graph.atoms.find((a) => a.id === atomIdA)?.bonds.some((b) => b.to === atomIdB);
      return withMutation(state, graph, bondRemoved ? { deleteMode: false } : {});
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
