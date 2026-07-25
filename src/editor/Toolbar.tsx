import type { BondOrder, Element } from "../graph/types";
import { FUNCTIONAL_GROUPS, FUNCTIONAL_GROUP_IDS, type FunctionalGroupId } from "../graph/functionalGroups";
import type { StyleId } from "../styles";
import { groupMenuLabel } from "./groupMenuLabel";
import { ringMenuLabel } from "./ringMenuLabel";
import { ToolbarMenu, ToolbarMenuItem } from "./ToolbarMenu";
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
  /** The held element, or null while a ring is held instead -- an atom and a ring can't both be held at once. */
  activeElement: Element | null;
  activeBondOrder: BondOrder;
  onSelectElement: (element: Element) => void;
  onSelectBondOrder: (order: BondOrder) => void;
  activeStyle: StyleId;
  availableStyles: StyleId[];
  onSelectStyle: (style: StyleId) => void;
  /** Whether Skeletal can be picked right now -- it draws methane as nothing at all (bare carbon, no bonds), so it's disabled until there's more than one atom. */
  canSelectSkeletal: boolean;
  /** Whether a ring can be armed at all right now (the molecule doesn't already have one) — a specific stub's own valency is checked when it's clicked. */
  canSelectRing: boolean;
  /** The currently-armed ring, waiting for a stub click, or null if none is armed. */
  activeRing: { size: number; aromatic: boolean } | null;
  onSelectRing: (size: number, aromatic: boolean) => void;
  /** The currently-armed functional group, waiting for a stub/atom click, or null if none is armed. */
  activeGroup: FunctionalGroupId | null;
  onSelectGroup: (groupId: FunctionalGroupId) => void;
  /** Whether sticky click-to-delete mode is currently on -- shows the Delete button pressed. */
  deleteMode: boolean;
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
  canSelectSkeletal,
  canSelectRing,
  activeRing,
  onSelectRing,
  activeGroup,
  onSelectGroup,
  deleteMode,
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
        {/*
          Rings are, like elements, something the user holds and then places
          on a stub -- so the ring picker lives in this same group rather
          than getting its own row. Collapsing it into a menu also reclaims
          the horizontal space six ring-size buttons plus benzene used to take.
        */}
        <ToolbarMenu
          label={ringMenuLabel(activeRing)}
          disabled={!canSelectRing}
          active={activeRing !== null}
          ariaLabel="Ring"
        >
          {RING_SIZES.map((size) => {
            const isActive = activeRing !== null && !activeRing.aromatic && activeRing.size === size;
            return (
              <ToolbarMenuItem
                key={size}
                active={isActive}
                onSelect={() => onSelectRing(size, false)}
                title={`Click a stub to grow a ${size}-membered ring there`}
              >
                {size}-membered
              </ToolbarMenuItem>
            );
          })}
          <ToolbarMenuItem
            active={activeRing?.aromatic ?? false}
            onSelect={() => onSelectRing(6, true)}
            title="Click a stub to grow benzene there"
          >
            Benzene ⌬
          </ToolbarMenuItem>
        </ToolbarMenu>
        {/*
          Functional groups are held and placed exactly like rings -- arm one
          here, then click a stub to grow it or an atom to replace it in
          place -- so this menu lives in the same group as elements and rings
          rather than a row of its own.
        */}
        <ToolbarMenu label={groupMenuLabel(activeGroup)} active={activeGroup !== null} ariaLabel="Functional group">
          {FUNCTIONAL_GROUP_IDS.map((groupId) => (
            <ToolbarMenuItem
              key={groupId}
              active={activeGroup === groupId}
              onSelect={() => onSelectGroup(groupId)}
              title={`Click a stub to grow, or an atom to replace it with, ${FUNCTIONAL_GROUPS[groupId].label.toLowerCase()}`}
            >
              {FUNCTIONAL_GROUPS[groupId].label}
            </ToolbarMenuItem>
          ))}
        </ToolbarMenu>
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
      {availableStyles.length > 1 && (
        <div className={styles.group} aria-label="Formula style">
          {availableStyles.map((id) => {
            const disabled = id === "skeletal" && !canSelectSkeletal;
            return (
              <button
                key={id}
                type="button"
                className={`${styles.button} ${id === activeStyle ? styles.buttonActive : ""}`}
                aria-pressed={id === activeStyle}
                disabled={disabled}
                onClick={() => onSelectStyle(id)}
                title={disabled ? "Methane has no skeletal form -- it's just a bare carbon" : undefined}
              >
                {STYLE_LABELS[id]}
              </button>
            );
          })}
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
        <button
          type="button"
          className={`${styles.button} ${deleteMode ? styles.buttonDanger : ""}`}
          aria-pressed={deleteMode}
          onClick={onDelete}
          title={
            deleteMode ? "Click an atom or bond to delete it (Esc to exit)" : "Click to enter delete mode"
          }
        >
          Delete
        </button>
        <button type="button" className={styles.button} onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
