import { useState, type ReactNode } from "react";
import type { Atom } from "../graph/types";
import type { Point } from "../layout/geometry";
import type { LabelSpec } from "../styles/types";

/** Invisible hit area, large enough for touch/stylus. Bare (unlabelled) vertices stay clickable too. */
const HIT_RADIUS = 14;
const SELECTION_RADIUS = 12;
const ACCENT = "#2563eb";
const DANGER = "#dc2626";
const DANGER_FILL = "#fdeaea";

interface AtomViewProps {
  atom: Atom;
  position: Point;
  /** What this vertex shows, from the active style's label() rule. Null = bare vertex. */
  label: LabelSpec | null;
  isSelected: boolean;
  /** While on, hovering this atom previews red (it -- and its trimmed branch -- would be removed on click) instead of the replace-preview blue below. */
  deleteMode: boolean;
  /** False for the seed atom while delete mode is on -- it can't be deleted, so hovering it previews nothing. */
  deletable: boolean;
  onActivate: (atomId: string) => void;
}

const LABEL_FONT_SIZE = 14;
const SUBSCRIPT_FONT_SIZE = 10;
/** Half the label font's cap height: shifts the alphabetic baseline down so glyphs centre on the atom position, in place of `dominant-baseline`, which WebKit resolves inconsistently for mixed bare-text/tspan children. */
const BASELINE_CENTER_OFFSET = 5;
/** Vertical drop for the subscript digit(s), via `dy` rather than `baseline-shift` — the latter is unreliable across renderers once sibling text has a different font-size. */
const SUBSCRIPT_DROP = 3;

function LabelText({ position, label, fill }: { position: Point; label: LabelSpec; fill: string }) {
  const subscript = label.hydrogenCount > 1 ? String(label.hydrogenCount) : null;
  const hydrogen = label.hydrogenCount > 0 ? "H" : "";

  let content: ReactNode;
  if (subscript === null) {
    content = label.hydrogenSide === "before" ? `${hydrogen}${label.main}` : `${label.main}${hydrogen}`;
  } else if (label.hydrogenSide === "before") {
    content = (
      <>
        <tspan>H</tspan>
        <tspan dy={SUBSCRIPT_DROP} fontSize={SUBSCRIPT_FONT_SIZE}>
          {subscript}
        </tspan>
        <tspan dy={-SUBSCRIPT_DROP}>{label.main}</tspan>
      </>
    );
  } else {
    content = (
      <>
        <tspan>{label.main}H</tspan>
        <tspan dy={SUBSCRIPT_DROP} fontSize={SUBSCRIPT_FONT_SIZE}>
          {subscript}
        </tspan>
      </>
    );
  }

  return (
    <text
      x={position.x}
      y={position.y + BASELINE_CENTER_OFFSET}
      textAnchor="middle"
      fontSize={LABEL_FONT_SIZE}
      fontFamily="system-ui, sans-serif"
      fill={fill}
    >
      {content}
    </text>
  );
}

export function AtomView({ atom, position, label, isSelected, deleteMode, deletable, onActivate }: AtomViewProps) {
  const [hovered, setHovered] = useState(false);
  const previewDelete = deleteMode && deletable && hovered;
  // Hovering previews the armed toolbar element being applied on click, same as if it were already selected.
  const previewReplace = !deleteMode && hovered;
  const accent = previewDelete ? DANGER : ACCENT;
  const highlighted = isSelected || previewDelete || previewReplace;
  const highlightFill = previewDelete ? DANGER_FILL : "#eaf1ff";

  return (
    <g
      onPointerDown={(event) => {
        event.stopPropagation();
        onActivate(atom.id);
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{ cursor: "pointer" }}
    >
      <circle cx={position.x} cy={position.y} r={HIT_RADIUS} fill="transparent" />
      {highlighted && <circle cx={position.x} cy={position.y} r={SELECTION_RADIUS} fill={highlightFill} />}
      {label && (
        <>
          <circle cx={position.x} cy={position.y} r={9} fill={highlighted ? highlightFill : "#ffffff"} />
          <LabelText position={position} label={label} fill={highlighted ? accent : "#1a1d21"} />
        </>
      )}
    </g>
  );
}
