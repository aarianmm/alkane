import { describe, expect, it } from "vitest";
import { createSeedGraph } from "../graph/types";
import { addAtomFromStub } from "../graph/mutations";
import { openSlotCount } from "../graph/queries";
import { computeBondAngles } from "../layout/geometry";
import { displayed } from "./displayed";
import { structural } from "./structural";
import type { LabelSpec } from "./types";

describe("structural.childAngle", () => {
  it("is identical to Displayed's — the two styles differ only in hydrogen presentation", () => {
    expect(structural.childAngle).toBe(displayed.childAngle);
  });
});

describe("structural.label", () => {
  it.each<[string, number, number[], LabelSpec]>([
    ["right chain end", 3, [180], { main: "C", hydrogenCount: 3, hydrogenSide: "after" }],
    ["left chain end", 3, [0], { main: "C", hydrogenCount: 3, hydrogenSide: "before" }],
    ["bare seed (no bonds)", 4, [], { main: "C", hydrogenCount: 4, hydrogenSide: "after" }],
    ["mid-chain", 2, [180, 0], { main: "C", hydrogenCount: 2, hydrogenSide: "after" }],
    ["vertical-branch methyl", 3, [270], { main: "C", hydrogenCount: 3, hydrogenSide: "after" }],
    ["zero hydrogens stays plain (e.g. carboxyl carbon)", 0, [180], { main: "C", hydrogenCount: 0, hydrogenSide: "after" }],
  ])("%s", (_desc, hydrogenCount, bondAngles, expected) => {
    const atom = { id: "0", element: "C" as const, bonds: [] };
    expect(structural.label(atom, { hydrogenCount, angleIn: null, bondAngles })).toEqual(expected);
  });

  it("bundles a heteroatom's hydrogens the same way (OH)", () => {
    const atom = { id: "0", element: "O" as const, bonds: [] };
    expect(structural.label(atom, { hydrogenCount: 1, angleIn: 0, bondAngles: [180] })).toEqual({
      main: "O",
      hydrogenCount: 1,
      hydrogenSide: "after",
    });
  });
});

describe("structural style flags", () => {
  it("never draws hydrogens as their own positioned pseudo-atoms", () => {
    expect(structural.rendersExplicitHydrogens).toBe(false);
  });
});

it("labels a built butane chain H3C-CH2-CH2-CH3 end to end", () => {
  let graph = createSeedGraph();
  graph = addAtomFromStub(graph, graph.rootId, "C", 1); // "1"
  graph = addAtomFromStub(graph, "1", "C", 1); // "2"
  graph = addAtomFromStub(graph, "2", "C", 1); // "3"

  const bondAngles = computeBondAngles(graph, structural);
  const specs: LabelSpec[] = graph.atoms.map((atom) =>
    structural.label(atom, {
      hydrogenCount: openSlotCount(atom),
      angleIn: null,
      bondAngles: bondAngles.get(atom.id) ?? [],
    })!,
  );

  const condensed = specs.map((s) =>
    s.hydrogenSide === "before" ? `H${s.hydrogenCount}${s.main}` : `${s.main}H${s.hydrogenCount}`,
  );
  expect(condensed).toEqual(["H3C", "CH2", "CH2", "CH3"]);
});
