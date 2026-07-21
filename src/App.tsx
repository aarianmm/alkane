import { MoleculeEditor } from "./editor/MoleculeEditor";
import { Toolbar } from "./editor/Toolbar";
import { NamePanel } from "./components/NamePanel";
import { createEmptyGraph } from "./graph/types";
import styles from "./App.module.css";

export function App() {
  const graph = createEmptyGraph();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Alkane</h1>
      </header>

      <main className={styles.main}>
        <Toolbar />
        <MoleculeEditor graph={graph} />
        <NamePanel />
      </main>
    </div>
  );
}
