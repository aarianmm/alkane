import type { Atom } from "../graph/types";
import type { Point } from "../layout/geometry";
import { showsAtomLabel } from "./labels";

/** Invisible hit area, large enough for touch/stylus. Bare (unlabelled) vertices stay clickable too. */
const HIT_RADIUS = 14;
const SELECTION_RADIUS = 12;
const ACCENT = "#2563eb";

interface AtomViewProps {
  atom: Atom;
  position: Point;
  isSelected: boolean;
  onActivate: (atomId: string) => void;
}

export function AtomView({ atom, position, isSelected, onActivate }: AtomViewProps) {
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
      {showsAtomLabel(atom) && (
        <>
          <circle cx={position.x} cy={position.y} r={9} fill={isSelected ? "#eaf1ff" : "#ffffff"} />
          <text
            x={position.x}
            y={position.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={14}
            fontFamily="system-ui, sans-serif"
            fill={isSelected ? ACCENT : "#1a1d21"}
          >
            {atom.element}
          </text>
        </>
      )}
    </g>
  );
}
