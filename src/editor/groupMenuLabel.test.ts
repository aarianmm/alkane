import { describe, expect, it } from "vitest";
import { groupMenuLabel } from "./groupMenuLabel";

describe("groupMenuLabel", () => {
  it("names the menu generically when no group is armed", () => {
    expect(groupMenuLabel(null)).toBe("Groups");
  });

  it("names the armed group", () => {
    expect(groupMenuLabel("hydroxyl")).toBe("Hydroxyl");
    expect(groupMenuLabel("carboxylicAcid")).toBe("Carboxylic acid");
    expect(groupMenuLabel("nitro")).toBe("Nitro");
  });
});
