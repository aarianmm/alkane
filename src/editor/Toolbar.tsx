import type { BondOrder, Element } from "../graph/types";
import styles from "./Toolbar.module.css";

const ELEMENTS: Element[] = ["C", "O", "N", "S", "F", "Cl", "Br", "I"];
const BOND_ORDERS: { order: BondOrder; label: string }[] = [
  { order: 1, label: "—" },
  { order: 2, label: "=" },
  { order: 3, label: "≡" },
];

interface ToolbarProps {
  activeElement: Element;
  activeBondOrder: BondOrder;
  onSelectElement: (element: Element) => void;
  onSelectBondOrder: (order: BondOrder) => void;
  canDelete: boolean;
  onDelete: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function Toolbar({
  activeElement,
  activeBondOrder,
  onSelectElement,
  onSelectBondOrder,
  canDelete,
  onDelete,
  onClear,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ToolbarProps) {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Molecule editing tools">
      <div className={styles.group} aria-label="Element">
        {ELEMENTS.map((element) => (
          <button
            key={element}
            type="button"
            className={`${styles.button} ${element === activeElement ? styles.buttonActive : ""}`}
            aria-pressed={element === activeElement}
            onClick={() => onSelectElement(element)}
          >
            {element}
          </button>
        ))}
      </div>
      <div className={styles.group} aria-label="Bond order">
        {BOND_ORDERS.map(({ order, label }) => (
          <button
            key={order}
            type="button"
            className={`${styles.button} ${order === activeBondOrder ? styles.buttonActive : ""}`}
            aria-pressed={order === activeBondOrder}
            onClick={() => onSelectBondOrder(order)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.group} aria-label="History">
        <button type="button" className={styles.button} disabled={!canUndo} onClick={onUndo} title="Undo (Ctrl/Cmd+Z)">
          Undo
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (Ctrl/Cmd+Shift+Z)"
        >
          Redo
        </button>
      </div>
      <div className={styles.group} aria-label="Editing">
        <button type="button" className={styles.button} disabled={!canDelete} onClick={onDelete}>
          Delete
        </button>
        <button type="button" className={styles.button} onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
