import type { MoleculeGraph } from "../graph/types";
import styles from "./MoleculeEditor.module.css";

interface MoleculeEditorProps {
  graph: MoleculeGraph;
}

/**
 * Renders the molecule graph as SVG. This component only draws the graph —
 * it must never be the source of chemical meaning.
 */
export function MoleculeEditor({ graph: _graph }: MoleculeEditorProps) {
  return (
    <div className={styles.editor}>
      <svg
        className={styles.canvas}
        viewBox="0 0 400 300"
        role="img"
        aria-label="Molecule editor canvas"
      >
        {/* Atoms and bonds render here */}
      </svg>
    </div>
  );
}
