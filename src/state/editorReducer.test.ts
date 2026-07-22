import { describe, expect, it } from "vitest";
import { closeRingBond } from "../graph/mutations";
import { createInitialState, editorReducer } from "./editorReducer";

describe("editorReducer", () => {
  it("starts with a single seed carbon and the default growth tool", () => {
    const state = createInitialState();
    expect(state.graph.atoms).toHaveLength(1);
    expect(state.tool).toEqual({ element: "C", bondOrder: 1 });
  });

  it("grows an atom using the current tool", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SET_TOOL_ELEMENT", element: "O" });
    state = editorReducer(state, { type: "SET_TOOL_BOND_ORDER", bondOrder: 2 });
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId, angle: 0 });

    expect(state.graph.atoms).toHaveLength(2);
    const grown = state.graph.atoms.find((a) => a.id !== state.graph.rootId)!;
    expect(grown.element).toBe("O");
    expect(grown.bonds[0].order).toBe(2);
  });

  it("changing the tool doesn't affect already-placed atoms", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId, angle: 0 });
    const before = state.graph;

    state = editorReducer(state, { type: "SET_TOOL_ELEMENT", element: "N" });

    expect(state.graph).toBe(before);
  });
});

describe("selection", () => {
  it("selects and clears atoms and bonds", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SELECT_ATOM", atomId: state.graph.rootId });
    expect(state.selection).toEqual({ kind: "atom", atomId: state.graph.rootId });

    state = editorReducer(state, { type: "SELECT_BOND", atomIdA: "0", atomIdB: "1" });
    expect(state.selection).toEqual({ kind: "bond", atomIdA: "0", atomIdB: "1" });

    state = editorReducer(state, { type: "CLEAR_SELECTION" });
    expect(state.selection).toBeNull();
  });
});

describe("RETYPE_SELECTED_ATOM", () => {
  it("retypes the selected atom", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SELECT_ATOM", atomId: state.graph.rootId });
    state = editorReducer(state, { type: "RETYPE_SELECTED_ATOM", element: "N" });

    expect(state.graph.atoms[0].element).toBe("N");
  });

  it("is a no-op when nothing (or a bond) is selected", () => {
    const state = createInitialState();
    const after = editorReducer(state, { type: "RETYPE_SELECTED_ATOM", element: "N" });
    expect(after).toBe(state);
  });
});

describe("SET_SELECTED_BOND_ORDER", () => {
  it("updates the selected bond's order", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId, angle: 0 });
    state = editorReducer(state, { type: "SELECT_BOND", atomIdA: state.graph.rootId, atomIdB: "1" });
    state = editorReducer(state, { type: "SET_SELECTED_BOND_ORDER", order: 3 });

    expect(state.graph.atoms[0].bonds[0].order).toBe(3);
  });

  it("is a no-op when nothing (or an atom) is selected", () => {
    const state = createInitialState();
    const after = editorReducer(state, { type: "SET_SELECTED_BOND_ORDER", order: 2 });
    expect(after).toBe(state);
  });
});

describe("DELETE_SELECTION", () => {
  it("prunes the selected atom's subtree and clears the selection", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId, angle: 0 });
    state = editorReducer(state, { type: "SELECT_ATOM", atomId: "1" });
    state = editorReducer(state, { type: "DELETE_SELECTION" });

    expect(state.graph.atoms).toHaveLength(1);
    expect(state.selection).toBeNull();
  });

  it("refuses to delete the seed atom", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "SELECT_ATOM", atomId: state.graph.rootId });
    const after = editorReducer(state, { type: "DELETE_SELECTION" });

    expect(after.graph.atoms).toHaveLength(1);
    expect(after.selection).toEqual({ kind: "atom", atomId: state.graph.rootId });
  });

  it("removes just the bond when a ring bond is selected", () => {
    // Ring closure isn't wired up as a user gesture until a later stage, so
    // build the ring with the graph mutation directly to set up the scenario.
    let state = createInitialState();
    for (let i = 0; i < 5; i++) {
      const parent = i === 0 ? state.graph.rootId : String(i);
      state = editorReducer(state, { type: "GROW_ATOM", atomId: parent, angle: 0 });
    }
    state = { ...state, graph: closeRingBond(state.graph, "5", "0", 1) };

    state = editorReducer(state, { type: "SELECT_BOND", atomIdA: "5", atomIdB: "0" });
    state = editorReducer(state, { type: "DELETE_SELECTION" });

    expect(state.graph.atoms).toHaveLength(6); // no atom removed, just the edge
  });
});

describe("CLEAR_MOLECULE", () => {
  it("resets to a fresh seed and clears selection", () => {
    let state = createInitialState();
    state = editorReducer(state, { type: "GROW_ATOM", atomId: state.graph.rootId, angle: 0 });
    state = editorReducer(state, { type: "SELECT_ATOM", atomId: "1" });
    state = editorReducer(state, { type: "CLEAR_MOLECULE" });

    expect(state.graph.atoms).toHaveLength(1);
    expect(state.selection).toBeNull();
  });
});
