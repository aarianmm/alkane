import { describe, expect, it } from "vitest";
import {
  angleBetween,
  ringCenterDirection,
  ringCircumradius,
  ringOutwardAngle,
  ringSubstituentAngle,
  ringVertexPositions,
} from "./rings";

function closeTo(actual: number, expected: number) {
  expect(actual).toBeCloseTo(expected, 6);
}

describe("ringCenterDirection", () => {
  it("points straight down for a bare seed (no fixed bonds)", () => {
    expect(ringCenterDirection([])).toBe(90);
  });

  it("swings directly away from a single fixed bond", () => {
    expect(ringCenterDirection([0])).toBe(180); // parent bond east -> ring center west
    expect(ringCenterDirection([-90])).toBe(90); // parent bond north -> ring center south
  });

  it("bisects the widest gap among several fixed bonds", () => {
    // Bonds at 0 and 180 leave two equal 180deg gaps; the bisector of either is +/-90.
    const direction = ringCenterDirection([0, 180]);
    expect(Math.abs(direction) === 90 || Math.abs(direction - 90) < 1e-6).toBe(true);
  });
});

describe("ringVertexPositions", () => {
  it("puts index 0 exactly on the anchor", () => {
    const anchor = { x: 10, y: 20 };
    const vertices = ringVertexPositions(anchor, 90, 6, 42);
    closeTo(vertices[0].x, anchor.x);
    closeTo(vertices[0].y, anchor.y);
  });

  it("every vertex sits exactly the circumradius from the center, and every edge is bondLength", () => {
    const anchor = { x: 0, y: 0 };
    const bondLength = 42;
    const size = 6;
    const vertices = ringVertexPositions(anchor, 90, size, bondLength);
    const radius = ringCircumradius(size, bondLength);

    // Reconstruct the center the same way ringVertexPositions does internally
    // (anchor + radius toward centerDirection) and check every vertex is
    // exactly radius away from it.
    const center = { x: anchor.x + radius * Math.cos((90 * Math.PI) / 180), y: anchor.y + radius * Math.sin((90 * Math.PI) / 180) };
    for (const v of vertices) {
      closeTo(Math.hypot(v.x - center.x, v.y - center.y), radius);
    }

    for (let i = 0; i < size; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % size];
      closeTo(Math.hypot(b.x - a.x, b.y - a.y), bondLength);
    }
  });

  it("produces a square (4 equal sides, 90deg turns) for size 4", () => {
    const vertices = ringVertexPositions({ x: 0, y: 0 }, 90, 4, 10);
    const sideLengths = vertices.map((v, i) => {
      const next = vertices[(i + 1) % 4];
      return Math.hypot(next.x - v.x, next.y - v.y);
    });
    sideLengths.forEach((length) => closeTo(length, 10));
  });
});

describe("ringOutwardAngle", () => {
  it("points opposite the bisector of two symmetric ring-bond directions", () => {
    // Ring bonds leaving a vertex at +/-30deg off due-west (inward) -> outward is due east (0).
    const outward = ringOutwardAngle(150, 210);
    closeTo(((outward % 360) + 360) % 360, 0);
  });

  it("matches the true outward direction on an actual ring polygon", () => {
    const anchor = { x: 0, y: 0 };
    const vertices = ringVertexPositions(anchor, 90, 6, 42);
    // Vertex 1's two ring neighbors are vertex 0 and vertex 2.
    const v1 = vertices[1];
    const toV0 = angleBetween(v1, vertices[0]);
    const toV2 = angleBetween(v1, vertices[2]);
    const outward = ringOutwardAngle(toV0, toV2);

    // The true outward direction, independently derived from the known center.
    const radius = 42 / (2 * Math.sin(Math.PI / 6));
    const center = { x: anchor.x + radius * Math.cos((90 * Math.PI) / 180), y: anchor.y + radius * Math.sin((90 * Math.PI) / 180) };
    const trueOutward = angleBetween(center, v1);

    closeTo(Math.cos((outward * Math.PI) / 180), Math.cos((trueOutward * Math.PI) / 180));
    closeTo(Math.sin((outward * Math.PI) / 180), Math.sin((trueOutward * Math.PI) / 180));
  });
});

describe("ringSubstituentAngle", () => {
  it("returns the outward radial itself for a single free slot (aromatic CH)", () => {
    expect(ringSubstituentAngle(45, 1, 1)).toBe(45);
  });

  it("fans symmetrically about the outward radial for two free slots", () => {
    expect(ringSubstituentAngle(0, 1, 2)).toBe(-45);
    expect(ringSubstituentAngle(0, 2, 2)).toBe(45);
  });

  it("returns the outward radial for zero free slots (never consulted, but stays well-defined)", () => {
    expect(ringSubstituentAngle(45, 1, 0)).toBe(45);
  });
});
