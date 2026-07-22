import type { BondOrder } from "../graph/types";
import type { Point } from "../layout/geometry";

/** How far a line is shortened from an endpoint that renders a visible label. */
const LABEL_CLIP = 11;

/** Spacing between the parallel lines of a double/triple bond. */
const PARALLEL_OFFSET = 3.2;

/** Width of the invisible click/tap target running along the bond. */
const HIT_WIDTH = 16;

const ACCENT = "#2563eb";
const DEFAULT_STROKE = "#1a1d21";

interface BondViewProps {
  from: Point;
  to: Point;
  order: BondOrder;
  showFromLabel: boolean;
  showToLabel: boolean;
  isSelected: boolean;
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
  showFromLabel,
  showToLabel,
  isSelected,
  onActivate,
}: BondViewProps) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  // Perpendicular unit vector, for spacing the parallel lines of a double/triple bond.
  const px = -uy;
  const py = ux;

  const start = {
    x: from.x + (showFromLabel ? ux * LABEL_CLIP : 0),
    y: from.y + (showFromLabel ? uy * LABEL_CLIP : 0),
  };
  const end = {
    x: to.x - (showToLabel ? ux * LABEL_CLIP : 0),
    y: to.y - (showToLabel ? uy * LABEL_CLIP : 0),
  };

  return (
    <g
      onPointerDown={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      style={{ cursor: "pointer" }}
    >
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="transparent"
        strokeWidth={HIT_WIDTH}
      />
      <g stroke={isSelected ? ACCENT : DEFAULT_STROKE} strokeWidth={1.6} strokeLinecap="round">
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
