import { describe, expect, it } from "vitest";
import { computeViewBox } from "./viewBox";

describe("computeViewBox", () => {
  it("centres a single point in a minimum-size box", () => {
    const box = computeViewBox([{ x: 0, y: 0 }]);
    expect(box.x + box.width / 2).toBeCloseTo(0, 6);
    expect(box.y + box.height / 2).toBeCloseTo(0, 6);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });

  it("grows to fit every point with padding, centred on the bounding box", () => {
    const box = computeViewBox([
      { x: -50, y: 0 },
      { x: 50, y: 0 },
    ]);
    expect(box.x).toBeLessThan(-50);
    expect(box.x + box.width).toBeGreaterThan(50);
    expect(box.x + box.width / 2).toBeCloseTo(0, 6);
    expect(box.y + box.height / 2).toBeCloseTo(0, 6);
  });
});
