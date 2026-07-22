import { describe, expect, it } from "vitest";
import { hydrogenSideFromBonds } from "./labelSide";

describe("hydrogenSideFromBonds", () => {
  it.each<[number[], "before" | "after", string]>([
    [[], "after", "bare seed atom, no bonds (CH4)"],
    [[0], "before", "left chain end, bond leaves east (H3C-)"],
    [[180], "after", "right chain end, bond leaves west (-CH3)"],
    [[180, 0], "after", "mid-chain atom, bonds both ways"],
    [[270], "after", "vertical-branch atom (bond leaves straight down)"],
    [[0, 90], "before", "left end with a vertical branch (H2C<)"],
    [[-30], "before", "skeletal left-end heteroatom, bond leaves up-right (HO-)"],
  ])("bondAngles=%o -> %s (%s)", (bondAngles, expected) => {
    expect(hydrogenSideFromBonds(bondAngles)).toBe(expected);
  });
});
