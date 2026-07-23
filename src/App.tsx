import { useEffect, useReducer } from "react";
import { useMoleculeName } from "./api/useMoleculeName";
import { MoleculeEditor } from "./editor/MoleculeEditor";
import { NameDisplay } from "./editor/NameDisplay";
import { Toolbar } from "./editor/Toolbar";
import { hasRing } from "./graph/queries";
import { getStyle, STYLES } from "./styles";
import type { StyleId } from "./styles";
import { createInitialState, editorReducer } from "./state/editorReducer";

function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, createInitialState);
  const { selection, deleteMode } = state;
  const nameStatus = useMoleculeName(state.graph);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.key === "Delete" || event.key === "Backspace") && !deleteMode) {
        event.preventDefault();
        dispatch({ type: "TOGGLE_DELETE_MODE" });
      } else if (event.key === "Escape") {
        dispatch({ type: "EXIT_DELETE_MODE" });
        dispatch({ type: "CLEAR_SELECTION" });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteMode]);

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

  const style = getStyle(state.style);
  const availableStyles = Object.keys(STYLES) as StyleId[];

  // Arming a ring from the toolbar doesn't target an atom yet -- that comes
  // from whichever stub the user clicks next (GROW_ATOM in the reducer).
  // Only the molecule-wide "one ring" gate applies upfront; a specific
  // stub's valency is checked at click time.
  const canSelectRing = !hasRing(state.graph);
  const activeRing = selection?.kind === "pendingRing" ? { size: selection.size, aromatic: selection.aromatic } : null;

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
        activeElement={state.tool.element}
        activeBondOrder={state.tool.bondOrder}
        onSelectElement={(element) => dispatch({ type: "SET_TOOL_ELEMENT", element })}
        onSelectBondOrder={(order) => dispatch({ type: "SET_TOOL_BOND_ORDER", bondOrder: order })}
        activeStyle={state.style}
        availableStyles={availableStyles}
        onSelectStyle={(style) => dispatch({ type: "SET_STYLE", style })}
        canSelectRing={canSelectRing}
        activeRing={activeRing}
        onSelectRing={(size, aromatic) => dispatch({ type: "SELECT_RING", size, aromatic })}
        deleteMode={deleteMode}
        onDelete={() => dispatch({ type: "TOGGLE_DELETE_MODE" })}
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
          deleteMode={deleteMode}
          armedElement={state.tool.element}
          armedBondOrder={state.tool.bondOrder}
          onStubActivate={(atomId) => dispatch({ type: "GROW_ATOM", atomId })}
          onAtomActivate={(atomId) =>
            dispatch(deleteMode ? { type: "DELETE_ATOM_AT", atomId } : { type: "REPLACE_ATOM", atomId })
          }
          onBondActivate={(atomIdA, atomIdB) =>
            dispatch(
              deleteMode ? { type: "DELETE_BOND_AT", atomIdA, atomIdB } : { type: "REPLACE_BOND", atomIdA, atomIdB },
            )
          }
          onCanvasActivate={() => {
            dispatch({ type: "EXIT_DELETE_MODE" });
            dispatch({ type: "CLEAR_SELECTION" });
          }}
        />
      </div>
      <NameDisplay status={nameStatus} />
    </div>
  );
}

export default App;
