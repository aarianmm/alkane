import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Toolbar.module.css";

interface ToolbarMenuProps {
  /** Text on the trigger button -- callers can swap this for the armed item's own name so the toolbar still shows what's held. */
  label: string;
  /** Disables the trigger outright, e.g. while the molecule already has whatever this menu's items would arm. */
  disabled?: boolean;
  /** Whether something inside this menu is currently armed -- draws the trigger with the same pressed styling as a plain toolbar button. */
  active?: boolean;
  /** Accessible name for the popup itself. */
  ariaLabel: string;
  children: ReactNode;
}

/**
 * A small dropdown for a group of "hold one, then click to place" tools that
 * would otherwise take up a full row of buttons (ring sizes today; a second
 * holdable category is coming later). It only knows how to open, close, and
 * label itself -- callers supply the items as `ToolbarMenuItem`s and keep
 * owning the actual arm/select logic.
 */
export function ToolbarMenu({ label, disabled, active, ariaLabel, children }: ToolbarMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside pointer activity and on Escape. Listening on the
  // document (rather than only on this subtree) is what lets a click on the
  // molecule canvas -- a sibling, not an ancestor, of this menu -- close the
  // menu too, without the two ever needing to know about each other.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.menuContainer} ref={containerRef}>
      <button
        type="button"
        className={`${styles.button} ${active ? styles.buttonActive : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        // Selecting any item closes the menu -- rather than have every item
        // remember to call back out, let the click just bubble here.
        <div className={styles.menu} role="menu" aria-label={ariaLabel} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

interface ToolbarMenuItemProps {
  /** Marks this item as the one currently armed. */
  active?: boolean;
  title?: string;
  onSelect: () => void;
  children: ReactNode;
}

export function ToolbarMenuItem({ active, title, onSelect, children }: ToolbarMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`${styles.menuItem} ${active ? styles.menuItemActive : ""}`}
      aria-pressed={active ?? false}
      title={title}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}
