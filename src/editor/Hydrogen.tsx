import { useState } from "react";
import type { Point } from "../layout/geometry";

/** Invisible hit area, large enough for touch/stylus per the requirements doc — only present when this H is the grow target. */
const HIT_RADIUS = 14;
const ACCENT = "#2563eb";
const DEFAULT_FILL = "#1a1d21";

interface HydrogenViewProps {
  position: Point;
  /** Whether this is the app-chosen next free slot's hydrogen — the one gesture that grows a new atom in Displayed style. */
  isGrowthTarget: boolean;
  onActivate: () => void;
}

/**
 * An implicit hydrogen, rendered as its own labelled pseudo-atom (Displayed
 * style only — see Alkane-Geometry-Design.md). Never a graph node, never
 * selectable or deletable on its own; the one interaction it supports is the
 * growth gesture, and only for the single H per atom that occupies the
 * app-chosen next free slot.
 */
export function HydrogenView({ position, isGrowthTarget, onActivate }: HydrogenViewProps) {
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
    </g>
  );
}
