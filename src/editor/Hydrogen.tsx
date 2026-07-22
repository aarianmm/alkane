import { useState } from "react";
import type { Point } from "../layout/geometry";

/** Invisible hit area, large enough for touch/stylus per the requirements doc — only present when this H is the grow target. */
const HIT_RADIUS = 14;
const STUB_HIT_RADIUS = 10;
const STUB_DOT_RADIUS = 3;
const STUB_DOT_RADIUS_HOVER = 4.5;
const ACCENT = "#2563eb";
const DEFAULT_FILL = "#1a1d21";
const STUB_FILL = "#c6cad2";

interface HydrogenViewProps {
  position: Point;
  /** Whether this is the app-chosen next free slot's hydrogen — the one gesture that grows a new atom in Displayed style. */
  isGrowthTarget: boolean;
  /** A point just past the hydrogen, in the direction of growth — where the always-visible stub dot renders. Only meaningful when isGrowthTarget. */
  stubPosition?: Point;
  onActivate: () => void;
}

/**
 * An implicit hydrogen, rendered as its own labelled pseudo-atom (Displayed
 * style only — see Alkane-Geometry-Design.md). Never a graph node, never
 * selectable or deletable on its own; the one interaction it supports is the
 * growth gesture, and only for the single H per atom that occupies the
 * app-chosen next free slot. That H also carries a small stub dot just past
 * it, in the direction growth would continue, so the affordance reads at a
 * glance instead of only revealing itself on hover.
 */
export function HydrogenView({ position, isGrowthTarget, stubPosition, onActivate }: HydrogenViewProps) {
  const [hovered, setHovered] = useState(false);
  const highlighted = isGrowthTarget && hovered;

  return (
    <g
      onPointerDown={
        isGrowthTarget
          ? (event) => {
              event.stopPropagation();
              onActivate();
            }
          : undefined
      }
      onPointerEnter={isGrowthTarget ? () => setHovered(true) : undefined}
      onPointerLeave={isGrowthTarget ? () => setHovered(false) : undefined}
      style={{ cursor: isGrowthTarget ? "pointer" : "default" }}
    >
      {isGrowthTarget && <circle cx={position.x} cy={position.y} r={HIT_RADIUS} fill="transparent" />}
      <circle cx={position.x} cy={position.y} r={7} fill="#ffffff" />
      <text
        x={position.x}
        y={position.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontFamily="system-ui, sans-serif"
        fill={highlighted ? ACCENT : DEFAULT_FILL}
      >
        H
      </text>
      {isGrowthTarget && stubPosition && (
        <>
          <circle cx={stubPosition.x} cy={stubPosition.y} r={STUB_HIT_RADIUS} fill="transparent" />
          <circle
            cx={stubPosition.x}
            cy={stubPosition.y}
            r={highlighted ? STUB_DOT_RADIUS_HOVER : STUB_DOT_RADIUS}
            fill={highlighted ? ACCENT : STUB_FILL}
          />
        </>
      )}
    </g>
  );
}
