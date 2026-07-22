import { describe, expect, it } from "vitest";
import { createSeedGraph } from "../graph/types";
import { addAtomFromStub } from "../graph/mutations";
import { angularDistance } from "../layout/hydrogens";
import { layoutFromRoot } from "../layout/geometry";
import { displayed } from "./displayed";
import { skeletal } from "./skeletal";

describe("skeletal.childAngle — root", () => {
  it("carbon: 4 slots at -30/210/90/-90, each pair >= 60deg apart", () => {
    const valency = 4;
    const angles = [1, 2, 3, 4].map((slot) => skeletal.childAngle({ angleIn: null, grandAngleIn: null, slot, valency }));
    expect(angles).toEqual([-30, 210, 90, -90]);
  });

  it("divalent (O/S): 2 slots, a bend at the root (not a straight 180deg pair)", () => {
    const valency = 2;
    const angles = [1, 2].map((slot) => skeletal.childAngle({ angleIn: null, grandAngleIn: null, slot, valency }));
    expect(angularDistance(angles[0], angles[1])).toBe(120);
  });
});

describe("skeletal.childAngle — continuation alternates the turn", () => {
  it.each<[number, number | null, number, string]>([
    [-30, null, 30, "depth 1, east-opening root"],
    [210, null, 150, "depth 1, west-opening root"],
    [30, -30, -30, "turn opposite the parent's"],
    [-30, 30, 30, "turn opposite the parent's, other direction"],
    [30, 30, -30, "no parent turn (straight-through quaternary bond): tilt fallback"],
  ])("angleIn=%d, grandAngleIn=%o -> %d (%s)", (angleIn, grandAngleIn, expected) => {
    expect(skeletal.childAngle({ angleIn, grandAngleIn, slot: 1, valency: 4 })).toBe(expected);
  });

  it("never drifts off the two lattice directions over a long chain", () => {
    let angleIn = -30;
    let grandAngleIn: number | null = null;
    const seen = new Set<number>();
    for (let i = 0; i < 10; i++) {
      const next = skeletal.childAngle({ angleIn, grandAngleIn, slot: 1, valency: 4 });
      seen.add(next);
      grandAngleIn = angleIn;
      angleIn = next;
    }
    expect(seen).toEqual(new Set([-30, 30]));
  });
});

describe("skeletal.childAngle — branches", () => {
  it("slot 2 takes the other 60deg side from slot 1's continuation", () => {
    const ctx = { angleIn: 30, grandAngleIn: -30, valency: 4 };
    const slot1 = skeletal.childAngle({ ...ctx, slot: 1 });
    const slot2 = skeletal.childAngle({ ...ctx, slot: 2 });
    expect(slot1).toBe(-30);
    expect(slot2).toBe(90);
  });

  it("slot 3 (quaternary 4th bond) goes straight through the vertex, not on top of the parent", () => {
    const angle = skeletal.childAngle({ angleIn: 30, grandAngleIn: -30, slot: 3, valency: 4 });
    expect(angle).toBe(30);
    expect(angle).not.toBe(210); // the design doc's literal "angleIn + 180" would land here, on the parent atom
  });
});

describe("skeletal.label", () => {
  it("carbon is always a bare vertex, regardless of hydrogen count", () => {
    const atom = { id: "0", element: "C" as const, bonds: [] };
    expect(skeletal.label(atom, { hydrogenCount: 3, angleIn: null, bondAngles: [] })).toBeNull();
    expect(skeletal.label(atom, { hydrogenCount: 0, angleIn: null, bondAngles: [] })).toBeNull();
  });

  it("heteroatoms bundle hydrogens exactly like Structural", () => {
    const oh = skeletal.label({ id: "0", element: "O" as const, bonds: [] }, { hydrogenCount: 1, angleIn: 150, bondAngles: [150] });
    expect(oh).toEqual({ main: "O", hydrogenCount: 1, hydrogenSide: "after" });

    const ho = skeletal.label({ id: "0", element: "O" as const, bonds: [] }, { hydrogenCount: 1, angleIn: -30, bondAngles: [-30] });
    expect(ho?.hydrogenSide).toBe("before");
  });
});

describe("skeletal style flags", () => {
  it("never draws hydrogens as their own positioned pseudo-atoms", () => {
    expect(skeletal.rendersExplicitHydrogens).toBe(false);
  });
});

it("bends an ether at the oxygen — the whole reason this style exists as separate logic", () => {
  let graph = createSeedGraph();
  graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"
  graph = addAtomFromStub(graph, "1", "O", 1); // "2", divalent
  graph = addAtomFromStub(graph, "2", "C", 1); // "3"

  // Vertex angle AT the oxygen: is C(1)-O(2)-C(3) straight or bent?
  function crossAtOxygen(positions: Map<string, { x: number; y: number }>): number {
    const a = positions.get("1")!;
    const b = positions.get("2")!;
    const c = positions.get("3")!;
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  }

  expect(Math.abs(crossAtOxygen(layoutFromRoot(graph, skeletal)))).toBeGreaterThan(1);
  // Contrast: the same graph under Displayed runs straight through the ether.
  expect(crossAtOxygen(layoutFromRoot(graph, displayed))).toBeCloseTo(0, 6);
});
