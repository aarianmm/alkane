import { describe, expect, it } from "vitest";
import { hydrogenSideFromBonds } from "./labelSide";

describe("hydrogenSideFromBonds", () => {
  it("suffixes a bare atom with no bonds at all (the seed, e.g. CH4)", () => {
    expect(hydrogenSideFromBonds([])).toBe("after");
  });

  it("prefixes a left chain end — its only bond leaves eastward (H3C-)", () => {
    expect(hydrogenSideFromBonds([0])).toBe("before");
  });

  it("suffixes a right chain end — its only bond leaves westward (-CH3)", () => {
    expect(hydrogenSideFromBonds([180])).toBe("after");
  });

  it("suffixes a mid-chain atom with bonds leaving both ways", () => {
    expect(hydrogenSideFromBonds([180, 0])).toBe("after");
  });

  it("suffixes a vertical-branch atom (its bond leaves straight down, not horizontal)", () => {
    expect(hydrogenSideFromBonds([270])).toBe("after");
    expect(hydrogenSideFromBonds([-90])).toBe("after");
  });

  it("prefixes a left end that also carries a vertical branch (H2C<)", () => {
    expect(hydrogenSideFromBonds([0, 90])).toBe("before");
  });

  it("prefixes a skeletal-lattice left-end heteroatom whose bond leaves up-right (HO-)", () => {
    expect(hydrogenSideFromBonds([-30])).toBe("before");
  });

  it("suffixes a skeletal-lattice right-end heteroatom whose bond leaves down-left (-OH)", () => {
    expect(hydrogenSideFromBonds([150])).toBe("after");
  });
});
