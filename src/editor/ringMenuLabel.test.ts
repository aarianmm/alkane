import { describe, expect, it } from "vitest";
import { ringMenuLabel } from "./ringMenuLabel";

describe("ringMenuLabel", () => {
  it("names the menu generically when no ring is armed", () => {
    expect(ringMenuLabel(null)).toBe("Rings");
  });

  it("names the armed size for a non-aromatic ring", () => {
    expect(ringMenuLabel({ size: 6, aromatic: false })).toBe("Ring 6");
    expect(ringMenuLabel({ size: 3, aromatic: false })).toBe("Ring 3");
  });

  it("names benzene distinctly even though it's also a 6-ring", () => {
    expect(ringMenuLabel({ size: 6, aromatic: true })).toBe("Benzene");
  });
});
