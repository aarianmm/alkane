import { useState } from "react";
import type { BondOrder } from "../graph/types";
import type { Point } from "../layout/geometry";
import type { LabelSpec } from "../styles/types";
import { clipDistance } from "./labelMetrics";

/** Spacing between the parallel lines of a double/triple bond. */
const PARALLEL_OFFSET = 3.2;

/** Width of the invisible click/tap target running along the bond. */
const HIT_WIDTH = 16;

const ACCENT = "#2563eb";
const DANGER = "#dc2626";
export const DEFAULT_STROKE = "#1a1d21";
export const DEFAULT_STROKE_WIDTH = 1.6;

interface BondViewProps {
  from: Point;
  to: Point;
  order: BondOrder;
  fromLabel: LabelSpec | null;
  toLabel: LabelSpec | null;
  isSelected: boolean;
  /** While on, hovering this bond previews red -- a click will decrement its order, or sever it once it's already single. */
  deleteMode: boolean;
  /** False for the decorative implicit-hydrogen bond line -- it isn't a real editable bond, so hovering it previews nothing. */
  interactive: boolean;
  /** False when the armed toolbar bond order already matches this bond -- clicking would be a no-op, so hovering previews nothing (delete-mode preview is unaffected). */
  replaceable: boolean;
  onActivate: () => void;
}

function offsetsForOrder(order: BondOrder): number[] {
  switch (order) {
    case 1:
      return [0];
    case 2:
      return [-PARALLEL_OFFSET, PARALLEL_OFFSET];
    case 3:
      return [-PARALLEL_OFFSET * 1.5, 0, PARALLEL_OFFSET * 1.5];
  }
}

export function BondView({
  from,
  to,
  order,
  fromLabel,
  toLabel,
  isSelected,
  deleteMode,
  interactive,
  replaceable,
  onActivate,
}: BondViewProps) {
  const [hovered, setHovered] = useState(false);
  const previewDelete = interactive && deleteMode && hovered;
  // Hovering previews the armed toolbar bond order being applied on click, same as if it were already selected.
  const previewReplace = interactive && replaceable && !deleteMode && hovered;
  const clickable = deleteMode ? interactive : interactive && replaceable;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  // Perpendicular unit vector, for spacing the parallel lines of a double/triple bond.
  const px = -uy;
  const py = ux;

  const fromClip = clipDistance(fromLabel, ux, uy);
  const toClip = clipDistance(toLabel, ux, uy);

  const start = { x: from.x + ux * fromClip, y: from.y + uy * fromClip };
  const end = { x: to.x - ux * toClip, y: to.y - uy * toClip };

  return (
    <g
      onPointerDown={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{ cursor: clickable ? "pointer" : "default" }}
    >
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="transparent"
        strokeWidth={HIT_WIDTH}
      />
      <g
        stroke={previewDelete ? DANGER : isSelected || previewReplace ? ACCENT : DEFAULT_STROKE}
        strokeWidth={DEFAULT_STROKE_WIDTH}
        strokeLinecap="round"
      >
        {offsetsForOrder(order).map((offset) => (
          <line
            key={offset}
            x1={start.x + px * offset}
            y1={start.y + py * offset}
            x2={end.x + px * offset}
            y2={end.y + py * offset}
          />
        ))}
      </g>
    </g>
  );
}
