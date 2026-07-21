import styles from "./Toolbar.module.css";

/**
 * Editing controls for atoms, bonds and selection. Collapses to a compact
 * bar with expandable sections on narrow viewports.
 */
export function Toolbar() {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Molecule editing tools">
      <div className={styles.group} aria-label="Atom tools" />
      <div className={styles.group} aria-label="Bond tools" />
      <div className={styles.group} aria-label="History" />
    </div>
  );
}
