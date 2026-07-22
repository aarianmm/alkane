import type { Atom } from "../graph/types";
import type { Point } from "../layout/geometry";
import type { LabelSpec } from "../styles/types";

/** Invisible hit area, large enough for touch/stylus. Bare (unlabelled) vertices stay clickable too. */
const HIT_RADIUS = 14;
const SELECTION_RADIUS = 12;
const ACCENT = "#2563eb";

interface AtomViewProps {
  atom: Atom;
  position: Point;
  /** What this vertex shows, from the active style's label() rule. Null = bare vertex. */
  label: LabelSpec | null;
  isSelected: boolean;
  onActivate: (atomId: string) => void;
}

function LabelText({ position, label, fill }: { position: Point; label: LabelSpec; fill: string }) {
  const hydrogenPart = label.hydrogenCount > 0 && (
    <tspan>
      H
      {label.hydrogenCount > 1 && (
        <tspan baselineShift="sub" fontSize={10}>
          {label.hydrogenCount}
        </tspan>
      )}
    </tspan>
  );

  return (
    <text
      x={position.x}
      y={position.y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={14}
      fontFamily="system-ui, sans-serif"
      fill={fill}
    >
      {label.hydrogenSide === "before" && hydrogenPart}
      {label.main}
      {label.hydrogenSide === "after" && hydrogenPart}
    </text>
  );
}

export function AtomView({ atom, position, label, isSelected, onActivate }: AtomViewProps) {
  return (
    <g
      onPointerDown={(event) => {
        event.stopPropagation();
        onActivate(atom.id);
      }}
      style={{ cursor: "pointer" }}
    >
      <circle cx={position.x} cy={position.y} r={HIT_RADIUS} fill="transparent" />
      {isSelected && <circle cx={position.x} cy={position.y} r={SELECTION_RADIUS} fill="#eaf1ff" />}
      {label && (
        <>
          <circle cx={position.x} cy={position.y} r={9} fill={isSelected ? "#eaf1ff" : "#ffffff"} />
          <LabelText position={position} label={label} fill={isSelected ? ACCENT : "#1a1d21"} />
        </>
      )}
    </g>
  );
}
