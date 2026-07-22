import { describe, expect, it } from "vitest";
import { clipDistance, labelHalfWidth } from "./labelMetrics";

describe("labelHalfWidth", () => {
  it("grows with the main symbol's glyph count", () => {
    const c = labelHalfWidth({ main: "C", hydrogenCount: 0, hydrogenSide: "after" });
    const cl = labelHalfWidth({ main: "Cl", hydrogenCount: 0, hydrogenSide: "after" });
    expect(cl).toBeGreaterThan(c);
  });

  it("grows again once a bundled hydrogen count is added", () => {
    const bare = labelHalfWidth({ main: "C", hydrogenCount: 0, hydrogenSide: "after" });
    const withOne = labelHalfWidth({ main: "C", hydrogenCount: 1, hydrogenSide: "after" });
    const withThree = labelHalfWidth({ main: "C", hydrogenCount: 3, hydrogenSide: "after" });

    expect(withOne).toBeGreaterThan(bare);
    // A subscript digit (>=2) widens it further beyond just the bundled "H".
    expect(withThree).toBeGreaterThan(withOne);
  });
});

describe("clipDistance", () => {
  const label = { main: "C", hydrogenCount: 0, hydrogenSide: "after" as const };

  it("clips nothing at a bare vertex (null label)", () => {
    expect(clipDistance(null, 1, 0)).toBe(0);
  });

  it("uses half the label's estimated width along a horizontal bond", () => {
    expect(clipDistance(label, 1, 0)).toBe(labelHalfWidth(label));
  });

  it("uses a fixed half-height along a vertical bond", () => {
    const horizontalClip = clipDistance(label, 1, 0);
    const verticalClip = clipDistance(label, 0, 1);
    expect(verticalClip).not.toBe(horizontalClip);
    // Same value regardless of which vertical direction.
    expect(clipDistance(label, 0, -1)).toBe(verticalClip);
  });
});
