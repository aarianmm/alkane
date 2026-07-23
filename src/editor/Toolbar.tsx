import type { BondOrder, Element } from "../graph/types";
import type { StyleId } from "../styles";
import styles from "./Toolbar.module.css";

const ELEMENTS: Element[] = ["C", "O", "N", "S", "F", "Cl", "Br", "I"];
const BOND_ORDERS: { order: BondOrder; label: string }[] = [
  { order: 1, label: "—" },
  { order: 2, label: "=" },
  { order: 3, label: "≡" },
];

/** The taught ring-size range. The engine names up to cyclodecane (10), but 3-8 covers what's actually taught. */
const RING_SIZES = [3, 4, 5, 6, 7, 8];

const STYLE_LABELS: Record<StyleId, string> = {
  displayed: "Displayed",
  structural: "Structural",
  skeletal: "Skeletal",
};

interface ToolbarProps {
  activeElement: Element;
  activeBondOrder: BondOrder;
  onSelectElement: (element: Element) => void;
  onSelectBondOrder: (order: BondOrder) => void;
  activeStyle: StyleId;
  availableStyles: StyleId[];
  onSelectStyle: (style: StyleId) => void;
  /** Whether a ring can be armed at all right now (the molecule doesn't already have one) — a specific stub's own valency is checked when it's clicked. */
  canSelectRing: boolean;
  /** The currently-armed ring, waiting for a stub click, or null if none is armed. */
  activeRing: { size: number; aromatic: boolean } | null;
  onSelectRing: (size: number, aromatic: boolean) => void;
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
  activeStyle,
  availableStyles,
  onSelectStyle,
  canSelectRing,
  activeRing,
  onSelectRing,
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
      <div className={styles.group} aria-label="Ring">
        {RING_SIZES.map((size) => {
          const isActive = activeRing !== null && !activeRing.aromatic && activeRing.size === size;
          return (
            <button
              key={size}
              type="button"
              className={`${styles.button} ${isActive ? styles.buttonActive : ""}`}
              aria-pressed={isActive}
              disabled={!canSelectRing}
              onClick={() => onSelectRing(size, false)}
              title={`Click a stub to grow a ${size}-membered ring there`}
            >
              {size}
            </button>
          );
        })}
        <button
          type="button"
          className={`${styles.button} ${activeRing?.aromatic ? styles.buttonActive : ""}`}
          aria-pressed={activeRing?.aromatic ?? false}
          disabled={!canSelectRing}
          onClick={() => onSelectRing(6, true)}
          title="Click a stub to grow benzene there"
        >
          ⌬
        </button>
      </div>
      {availableStyles.length > 1 && (
        <div className={styles.group} aria-label="Formula style">
          {availableStyles.map((id) => (
            <button
              key={id}
              type="button"
              className={`${styles.button} ${id === activeStyle ? styles.buttonActive : ""}`}
              aria-pressed={id === activeStyle}
              onClick={() => onSelectStyle(id)}
            >
              {STYLE_LABELS[id]}
            </button>
          ))}
        </div>
      )}
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
