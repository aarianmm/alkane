import { describe, expect, it } from "vitest";
import { closeRingBond } from "../graph/mutations";
import { findAtomById, findRing } from "../graph/queries";
import { createInitialState, editorReducer } from "./editorReducer";

describe("editorReducer", () => {
  it("starts with a single seed carbon, Displayed style, and the default growth tool", () => {
    const state = createInitialState();
    expect(state.graph.atoms).toHaveLength(1);
    expect(state.style).toBe("displayed");
    expect(state.tool).toEqual({ element: "C", bondOrder: 1 });
  });

  it("grows an atom using the current tool", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SET_TOOL_ELEMENT", element: "O" });
    state = editorReducer(state, { type: "SET_TOOL_BOND_ORDER", bondOrder: 2 });
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId });

    expect(state.graph.atoms).toHaveLength(2);
    const grown = state.graph.atoms.find((a) => a.id !== state.graph.rootId)!;
    expect(grown.element).toBe("O");
    expect(grown.bonds[0].order).toBe(2);
  });

  it("changing the tool doesn't affect already-placed atoms", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId });
    const before = state.graph;

    state = editorReducer(state, { type: "SET_TOOL_ELEMENT", element: "N" });

    expect(state.graph).toBe(before);
  });
});

describe("SELECT_RING", () => {
  it("arms a pending ring without touching the graph or history", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: false });

    expect(state.selection).toEqual({ kind: "pendingRing", size: 6, aromatic: false });
    expect(state.graph.atoms).toHaveLength(1);
    expect(state.history.past).toHaveLength(0);
  });

  it("replaces whatever ring was armed before", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SELECT_RING", size: 5, aromatic: false });
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: true });

    expect(state.selection).toEqual({ kind: "pendingRing", size: 6, aromatic: true });
  });

  it("arming an element un-arms a pending ring -- only one can be held at a time", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: false });

    state = editorReducer(state, { type: "SET_TOOL_ELEMENT", element: "O" });

    expect(state.selection).toBeNull();
    expect(state.tool.element).toBe("O");
  });
});

describe("GROW_ATOM with a pending ring armed", () => {
  it("hangs the ring off a fresh carbon grown from the clicked stub -- the clicked atom itself stays a substituent", () => {
    let state = createInitialState(); // seed carbon, methane
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: false });

    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId });

    // 1 fresh anchor carbon + 5 more ring carbons, plus the original seed
    // still present as a substituent = 7 atoms -- methylcyclohexane's shape.
    expect(state.graph.atoms).toHaveLength(7);
    const ring = findRing(state.graph)!;
    expect(ring).toHaveLength(6);
    expect(ring).not.toContain(state.graph.rootId); // the seed never joins the ring itself
    expect(state.selection).toBeNull();

    const seed = findAtomById(state.graph, state.graph.rootId)!;
    expect(seed.bonds).toHaveLength(1); // just the one new bond to the ring
    expect(ring).toContain(seed.bonds[0].to);
  });

  it("works from an open stub on any element, since the ring always anchors on a fresh carbon", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SET_TOOL_ELEMENT", element: "O" });
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1", oxygen
    state = editorReducer(state, { type: "SELECT_RING", size: 5, aromatic: false });

    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" });

    const oxygen = findAtomById(state.graph, "1")!;
    expect(oxygen.bonds).toHaveLength(2); // its original C-O parent bond, plus one new bond to the ring
    const ring = findRing(state.graph)!;
    expect(ring).not.toContain("1");
    expect(oxygen.bonds.some((b) => b.to === ring[0])).toBe(true);
  });

  it("is a no-op once a ring already exists in the molecule, and stays armed", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: false });
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId });
    const afterFirstRing = state.graph;

    state = editorReducer(state, { type: "SELECT_RING", size: 5, aromatic: false });
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId });

    expect(state.graph).toBe(afterFirstRing);
    expect(state.selection).toEqual({ kind: "pendingRing", size: 5, aromatic: false });
  });

  it("is a single undo step", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: true });
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId });
    expect(state.graph.atoms).toHaveLength(7);

    state = editorReducer(state, { type: "UNDO" });

    expect(state.graph.atoms).toHaveLength(1);
  });
});

describe("CLEAR_SELECTION", () => {
  it("cancels a pending ring arm without touching the graph", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: false });

    state = editorReducer(state, { type: "CLEAR_SELECTION" });

    expect(state.selection).toBeNull();
    expect(state.graph.atoms).toHaveLength(1);
  });

  it("is a no-op when nothing is armed", () => {
    const state = createInitialState();
    const after = editorReducer(state, { type: "CLEAR_SELECTION" });
    expect(after).toBe(state);
  });
});

describe("SET_STYLE", () => {
  it("changes the active style without touching history or a pending ring arm", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: false });
    const pastLength = state.history.past.length;

    state = editorReducer(state, { type: "SET_STYLE", style: "structural" });

    expect(state.style).toBe("structural");
    expect(state.history.past.length).toBe(pastLength);
    expect(state.selection).toEqual({ kind: "pendingRing", size: 6, aromatic: false });
  });

  it("is untouched by undo/redo of graph edits", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SET_STYLE", style: "structural" });
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId });

    state = editorReducer(state, { type: "UNDO" });
    expect(state.style).toBe("structural");
  });
});

describe("delete mode", () => {
  it("starts off", () => {
    const state = createInitialState();
    expect(state.deleteMode).toBe(false);
  });

  it("TOGGLE_DELETE_MODE turns it on and clears any pending ring arm", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: false });

    state = editorReducer(state, { type: "TOGGLE_DELETE_MODE" });

    expect(state.deleteMode).toBe(true);
    expect(state.selection).toBeNull();
  });

  it("TOGGLE_DELETE_MODE again turns it back off", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "TOGGLE_DELETE_MODE" });
    state = editorReducer(state, { type: "TOGGLE_DELETE_MODE" });

    expect(state.deleteMode).toBe(false);
  });

  it("EXIT_DELETE_MODE turns it off and is a no-op when already off", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "TOGGLE_DELETE_MODE" });

    state = editorReducer(state, { type: "EXIT_DELETE_MODE" });
    expect(state.deleteMode).toBe(false);

    const after = editorReducer(state, { type: "EXIT_DELETE_MODE" });
    expect(after).toBe(state);
  });

  it("DELETE_ATOM_AT prunes the clicked atom's subtree and exits delete mode", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1"
    state = editorReducer(state, { type: "TOGGLE_DELETE_MODE" });

    state = editorReducer(state, { type: "DELETE_ATOM_AT", atomId: "1" });

    expect(state.graph.atoms).toHaveLength(1);
    expect(state.deleteMode).toBe(false);
  });

  it("DELETE_ATOM_AT refuses to delete the seed atom", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "TOGGLE_DELETE_MODE" });

    const after = editorReducer(state, { type: "DELETE_ATOM_AT", atomId: state.graph.rootId });

    expect(after.graph.atoms).toHaveLength(1);
    expect(after.deleteMode).toBe(true);
  });

  it("DELETE_BOND_AT decrements a multi-order bond without exiting delete mode, then severs it once single and exits", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SET_TOOL_BOND_ORDER", bondOrder: 3 });
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1", triple-bonded
    state = editorReducer(state, { type: "TOGGLE_DELETE_MODE" });

    state = editorReducer(state, { type: "DELETE_BOND_AT", atomIdA: state.graph.rootId, atomIdB: "1" });
    expect(state.graph.atoms[0].bonds[0].order).toBe(2);
    expect(state.graph.atoms).toHaveLength(2);
    expect(state.deleteMode).toBe(true);

    state = editorReducer(state, { type: "DELETE_BOND_AT", atomIdA: state.graph.rootId, atomIdB: "1" });
    expect(state.graph.atoms[0].bonds[0].order).toBe(1);
    expect(state.graph.atoms).toHaveLength(2);
    expect(state.deleteMode).toBe(true);

    state = editorReducer(state, { type: "DELETE_BOND_AT", atomIdA: state.graph.rootId, atomIdB: "1" });
    expect(state.graph.atoms).toHaveLength(1);
    expect(state.deleteMode).toBe(false);
  });

  it("DELETE_BOND_AT removes just the bond when it's a ring bond, leaving the ring's atoms intact", () => {
    // Ring closure isn't wired up as a user gesture until a later stage, so
    // build the ring with the graph mutation directly to set up the scenario.
    let state = createInitialState();
    for (let i = 0; i < 5; i++) {
      const parent = i === 0 ? state.graph.rootId : String(i);
      state = editorReducer(state, { type: "GROW_ATOM", atomId: parent });
    }
    state = { ...state, graph: closeRingBond(state.graph, "5", "0", 1) };
    state = editorReducer(state, { type: "TOGGLE_DELETE_MODE" });

    state = editorReducer(state, { type: "DELETE_BOND_AT", atomIdA: "5", atomIdB: "0" });

    expect(state.graph.atoms).toHaveLength(6); // no atom removed, just the edge
  });
});

describe("REPLACE_ATOM", () => {
  it("retypes the clicked atom to the armed tool element", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1", carbon
    state = editorReducer(state, { type: "SET_TOOL_ELEMENT", element: "O" });

    state = editorReducer(state, { type: "REPLACE_ATOM", atomId: "1" });

    expect(findAtomById(state.graph, "1")!.element).toBe("O");
  });

  it("prunes branches that don't fit the armed element's lower valency", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1"
    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" }); // "2", off "1"
    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" }); // "3", off "1"
    state = editorReducer(state, { type: "SET_TOOL_ELEMENT", element: "O" }); // valency 2

    state = editorReducer(state, { type: "REPLACE_ATOM", atomId: "1" });

    const atom = findAtomById(state.graph, "1")!;
    expect(atom.element).toBe("O");
    expect(atom.bonds).toHaveLength(2); // parent + one surviving branch
  });

  it("is a single undo step even when it prunes multiple branches", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1"
    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" });
    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" });
    state = editorReducer(state, { type: "SET_TOOL_ELEMENT", element: "F" }); // valency 1
    const beforeReplace = state.graph;

    state = editorReducer(state, { type: "REPLACE_ATOM", atomId: "1" });
    state = editorReducer(state, { type: "UNDO" });

    expect(state.graph).toBe(beforeReplace);
  });

  it("is a true no-op when the atom already matches the armed element", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1", carbon
    const before = state;

    state = editorReducer(state, { type: "REPLACE_ATOM", atomId: "1" }); // tool is still the default "C"

    expect(state).toBe(before);
  });

  it("replaces the clicked carbon with the armed ring", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1"
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: false });

    state = editorReducer(state, { type: "REPLACE_ATOM", atomId: "1" });

    const ring = findRing(state.graph)!;
    expect(ring).toContain("1");
    expect(state.selection).toBeNull();
  });

  it("prunes the anchor's branches to free room for the armed ring", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1"
    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" }); // "2"
    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" }); // "3" -- "1" down to 1 open slot
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: true }); // needs 3 open

    state = editorReducer(state, { type: "REPLACE_ATOM", atomId: "1" });

    const ring = findRing(state.graph)!;
    expect(ring).toContain("1");
    expect(findAtomById(state.graph, "2")).toBeUndefined();
    expect(findAtomById(state.graph, "3")).toBeUndefined();
  });

  it("stays armed and leaves the graph untouched when the clicked atom isn't a carbon", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SET_TOOL_ELEMENT", element: "O" });
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1", oxygen
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: false });
    const before = state.graph;

    state = editorReducer(state, { type: "REPLACE_ATOM", atomId: "1" });

    expect(state.graph).toBe(before);
    expect(state.selection).toEqual({ kind: "pendingRing", size: 6, aromatic: false });
  });
});

describe("REPLACE_BOND", () => {
  it("changes the clicked bond to the armed tool bond order", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1"
    state = editorReducer(state, { type: "SET_TOOL_BOND_ORDER", bondOrder: 2 });

    state = editorReducer(state, { type: "REPLACE_BOND", atomIdA: state.graph.rootId, atomIdB: "1" });

    expect(findAtomById(state.graph, "1")!.bonds[0].order).toBe(2);
  });

  it("prunes a branch that no longer fits an endpoint saturated by other bonds", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1"
    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" }); // "2"
    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" }); // "3"
    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" }); // "4" -- "1" now fully saturated
    state = editorReducer(state, { type: "SET_TOOL_BOND_ORDER", bondOrder: 2 });

    state = editorReducer(state, { type: "REPLACE_BOND", atomIdA: state.graph.rootId, atomIdB: "1" });

    const atom = findAtomById(state.graph, "1")!;
    expect(atom.bonds.find((b) => b.to === state.graph.rootId)!.order).toBe(2);
    expect(atom.bonds).toHaveLength(3); // parent + two surviving branches
    expect(findAtomById(state.graph, "4")).toBeUndefined(); // highest-slot branch pruned
  });

  it("is a single undo step even when it prunes a branch", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1"
    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" }); // "2"
    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" }); // "3"
    state = editorReducer(state, { type: "GROW_ATOM", atomId: "1" }); // "4"
    state = editorReducer(state, { type: "SET_TOOL_BOND_ORDER", bondOrder: 2 });
    const beforeReplace = state.graph;

    state = editorReducer(state, { type: "REPLACE_BOND", atomIdA: state.graph.rootId, atomIdB: "1" });
    state = editorReducer(state, { type: "UNDO" });

    expect(state.graph).toBe(beforeReplace);
  });

  it("is a true no-op when the bond already matches the armed order", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1"
    const before = state;

    state = editorReducer(state, { type: "REPLACE_BOND", atomIdA: state.graph.rootId, atomIdB: "1" }); // tool is still the default order 1

    expect(state).toBe(before);
  });

  it("lowers an order without pruning anything", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SET_TOOL_BOND_ORDER", bondOrder: 3 });
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1", triple-bonded
    state = editorReducer(state, { type: "SET_TOOL_BOND_ORDER", bondOrder: 1 });

    state = editorReducer(state, { type: "REPLACE_BOND", atomIdA: state.graph.rootId, atomIdB: "1" });

    expect(findAtomById(state.graph, "1")!.bonds[0].order).toBe(1);
  });

  it("leaves the graph untouched when no such bond exists", () => {
    const state = createInitialState();
    const after = editorReducer(state, { type: "REPLACE_BOND", atomIdA: state.graph.rootId, atomIdB: "missing" });

    expect(after).toBe(state);
  });

  it("stays a no-op when the raise is impossible without cutting the edited bond", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SET_TOOL_ELEMENT", element: "F" });
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId }); // "1", fluorine
    state = editorReducer(state, { type: "SET_TOOL_BOND_ORDER", bondOrder: 2 });
    const before = state;

    state = editorReducer(state, { type: "REPLACE_BOND", atomIdA: state.graph.rootId, atomIdB: "1" });

    expect(state).toBe(before);
  });
});

describe("CLEAR_MOLECULE", () => {
  it("resets to a fresh seed and clears any pending ring arm", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId });
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: false });
    state = editorReducer(state, { type: "CLEAR_MOLECULE" });

    expect(state.graph.atoms).toHaveLength(1);
    expect(state.selection).toBeNull();
  });
});

describe("UNDO / REDO", () => {
  it("undoes and redoes a graph edit", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId });
    expect(state.graph.atoms).toHaveLength(2);

    state = editorReducer(state, { type: "UNDO" });
    expect(state.graph.atoms).toHaveLength(1);

    state = editorReducer(state, { type: "REDO" });
    expect(state.graph.atoms).toHaveLength(2);
  });

  it("is a no-op at either end of the stack", () => {
    const state = createInitialState();
    expect(editorReducer(state, { type: "UNDO" })).toBe(state);
    expect(editorReducer(state, { type: "REDO" })).toBe(state);
  });

  it("drops the redo stack once a new edit is made", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId });
    state = editorReducer(state, { type: "UNDO" });
    expect(state.history.future).toHaveLength(1);

    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId });
    expect(state.history.future).toHaveLength(0);
    expect(editorReducer(state, { type: "REDO" })).toBe(state);
  });

  it("clears a pending ring arm on undo/redo since it may no longer make sense against the restored graph", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId });
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: false });
    state = editorReducer(state, { type: "UNDO" });
    expect(state.selection).toBeNull();
  });

  it("doesn't record selection/tool changes as undoable edits", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SELECT_RING", size: 6, aromatic: false });
    state = editorReducer(state, { type: "SET_TOOL_ELEMENT", element: "N" });
    expect(state.history.past).toHaveLength(0);
  });
});
