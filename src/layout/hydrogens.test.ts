import { describe, expect, it } from "vitest";
import { angularDistance, placeHydrogens, toSignedAngle } from "./hydrogens";

function sorted(angles: number[]): number[] {
  return [...angles].sort((a, b) => a - b);
}

describe("angularDistance", () => {
  it("is symmetric and always the smaller of the two arcs", () => {
    expect(angularDistance(10, 20)).toBe(10);
    expect(angularDistance(350, 10)).toBe(20);
    expect(angularDistance(0, 180)).toBe(180);
  });
});

describe("toSignedAngle", () => {
  it("normalizes into (-180, 180]", () => {
    expect(toSignedAngle(270)).toBe(-90);
    expect(toSignedAngle(-270)).toBe(90);
    expect(toSignedAngle(450)).toBe(90);
  });
});

describe("placeHydrogens — the five worked cases from Alkane-Geometry-Design.md", () => {
  it("methane seed: 4 H at E/S/W/N, the classic cross", () => {
    const angles = placeHydrogens([0, 90, 180, 270], 4, []);
    expect(sorted(angles)).toEqual([0, 90, 180, 270]);
  });

  it("ethane: a terminal carbon's 3 H take every free slot — the outward horizontal plus N and S", () => {
    const angles = placeHydrogens([0, 90, 270], 3, [180]);
    expect(sorted(angles)).toEqual([0, 90, 270]);
  });

  it("ethene: each C's 2 H land at N and S, not one straight-out, breaking a 3-way tie by symmetry", () => {
    // Root carbon, double-bonded to the other C at 0°; 3 geometric slots are
    // free (90, 180, 270) for only 2 hydrogens, so this is a real choice.
    const angles = placeHydrogens([90, 180, 270], 2, [0]);
    expect(sorted(angles)).toEqual([90, 270]);
  });

  it("ethyne: the 1 H goes straight-through, opposite the triple bond — linear H-C=C-H", () => {
    const angles = placeHydrogens([90, 180, 270], 1, [0]);
    expect(angles).toEqual([180]);
  });

  it("aldehyde R-CHO: the 1 H is perpendicular, with the tie deterministically broken toward north", () => {
    // Non-root carbonyl carbon: parent at 180°, the double-bonded oxygen at
    // 0° (both on the horizontal chain axis), leaving +/-90 tied on pure
    // separation — resolved by the deterministic canonical tie-break.
    const angles = placeHydrogens([90, 270], 1, [180, 0]);
    expect(angles).toEqual([270]);
  });
});

describe("placeHydrogens — edge cases", () => {
  it("returns nothing when there is no open valency", () => {
    expect(placeHydrogens([0, 90, 180, 270], 0, [])).toEqual([]);
  });

  it("takes every free slot without searching when hydrogen count matches it exactly", () => {
    expect(sorted(placeHydrogens([0, 90], 2, [180, 270]))).toEqual([0, 90]);
  });
});
