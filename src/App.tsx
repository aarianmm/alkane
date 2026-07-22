import { useEffect, useReducer } from "react";
import { MoleculeEditor } from "./editor/MoleculeEditor";
import { Toolbar } from "./editor/Toolbar";
import { bondOrderBetween, findAtomById } from "./graph/queries";
import { getStyle } from "./styles";
import { createInitialState, editorReducer } from "./state/editorReducer";

function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, createInitialState);
  const { selection } = state;

  useEffect(() => {
    if (selection === null) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        dispatch({ type: "DELETE_SELECTION" });
      } else if (event.key === "Escape") {
        dispatch({ type: "CLEAR_SELECTION" });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selection]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      dispatch({ type: event.shiftKey ? "REDO" : "UNDO" });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // The toolbar shows and edits whatever is selected; with nothing selected
  // it falls back to the "next atom" growth tool.
  const displayedElement =
    selection?.kind === "atom" ? findAtomById(state.graph, selection.atomId)!.element : state.tool.element;
  const displayedBondOrder =
    selection?.kind === "bond"
      ? (bondOrderBetween(state.graph, selection.atomIdA, selection.atomIdB) ?? state.tool.bondOrder)
      : state.tool.bondOrder;

  const canDelete = selection !== null && !(selection.kind === "atom" && selection.atomId === state.graph.rootId);
  const style = getStyle(state.style);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minHeight: "100dvh",
        padding: "1.5rem",
        gap: "1rem",
      }}
    >
      <Toolbar
        activeElement={displayedElement}
        activeBondOrder={displayedBondOrder}
        onSelectElement={(element) =>
          dispatch(
            selection?.kind === "atom"
              ? { type: "RETYPE_SELECTED_ATOM", element }
              : { type: "SET_TOOL_ELEMENT", element },
          )
        }
        onSelectBondOrder={(order) =>
          dispatch(
            selection?.kind === "bond"
              ? { type: "SET_SELECTED_BOND_ORDER", order }
              : { type: "SET_TOOL_BOND_ORDER", bondOrder: order },
          )
        }
        canDelete={canDelete}
        onDelete={() => dispatch({ type: "DELETE_SELECTION" })}
        onClear={() => dispatch({ type: "CLEAR_MOLECULE" })}
        canUndo={state.history.past.length > 0}
        canRedo={state.history.future.length > 0}
        onUndo={() => dispatch({ type: "UNDO" })}
        onRedo={() => dispatch({ type: "REDO" })}
      />
      <div style={{ width: "min(90vw, 480px)", height: "min(90vw, 480px)", flex: 1 }}>
        <MoleculeEditor
          graph={state.graph}
          style={style}
          selection={selection}
          onStubActivate={(atomId) => dispatch({ type: "GROW_ATOM", atomId })}
          onAtomActivate={(atomId) => dispatch({ type: "SELECT_ATOM", atomId })}
          onBondActivate={(atomIdA, atomIdB) => dispatch({ type: "SELECT_BOND", atomIdA, atomIdB })}
          onCanvasActivate={() => dispatch({ type: "CLEAR_SELECTION" })}
        />
      </div>
    </div>
  );
}

export default App;
