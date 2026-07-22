import { useState } from "react";
import type { GrowthTarget } from "../layout/geometry";

/** Invisible hit area, large enough for touch/stylus per the requirements doc. */
const HIT_RADIUS = 14;
const DOT_RADIUS = 3;
const DOT_RADIUS_HOVER = 4.5;

interface StubViewProps {
  stub: GrowthTarget;
  onActivate: (atomId: string) => void;
}

export function StubView({ stub, onActivate }: StubViewProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <g
      onPointerDown={(event) => {
        event.stopPropagation();
        onActivate(stub.atomId);
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{ cursor: "pointer" }}
    >
      <circle cx={stub.position.x} cy={stub.position.y} r={HIT_RADIUS} fill="transparent" />
      <circle
        cx={stub.position.x}
        cy={stub.position.y}
        r={hovered ? DOT_RADIUS_HOVER : DOT_RADIUS}
        fill={hovered ? "#2563eb" : "#c6cad2"}
      />
    </g>
  );
}
