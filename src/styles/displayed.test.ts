import { describe, expect, it } from "vitest";
import { displayed } from "./displayed";

describe("displayed.childAngle — root", () => {
  it("carbon: east then west first, so a root with two real bonds still reads as one horizontal backbone — vertical branches only come after that", () => {
    const valency = 4;
    const angles = [1, 2, 3, 4].map((slot) => displayed.childAngle({ angleIn: null, grandAngleIn: null, slot, valency }));
    expect(angles).toEqual([0, 180, 90, -90]);
  });

  it("nitrogen: east then west first, then its one remaining slot branches off that axis", () => {
    const valency = 3;
    const angles = [1, 2, 3].map((slot) => displayed.childAngle({ angleIn: null, grandAngleIn: null, slot, valency }));
    expect(angles).toEqual([0, 180, 120]);
  });

  it("spaces a divalent atom's 2 slots 180° apart (already just east/west)", () => {
    const valency = 2;
    const angles = [1, 2].map((slot) => displayed.childAngle({ angleIn: null, grandAngleIn: null, slot, valency }));
    expect(angles).toEqual([0, 180]);
  });
});

describe("displayed.childAngle — non-root", () => {
  it("carbon: slot 1 continues straight through, slots 2/3 branch at +/-90", () => {
    const valency = 4;
    const angleIn = 30;
    const slot1 = displayed.childAngle({ angleIn, grandAngleIn: null, slot: 1, valency });
    const slot2 = displayed.childAngle({ angleIn, grandAngleIn: null, slot: 2, valency });
    const slot3 = displayed.childAngle({ angleIn, grandAngleIn: null, slot: 3, valency });

    expect(slot1).toBe(angleIn);
    expect(slot2).toBe(angleIn + 90);
    expect(slot3).toBe(angleIn - 90);
  });

  it("nitrogen: slot 1 continues straight through, its one remaining slot is 120° off that axis", () => {
    const valency = 3;
    const angleIn = 0;
    const slot1 = displayed.childAngle({ angleIn, grandAngleIn: null, slot: 1, valency });
    const slot2 = displayed.childAngle({ angleIn, grandAngleIn: null, slot: 2, valency });

    expect(slot1).toBe(angleIn);
    expect(slot2).toBe(angleIn + 120);
  });

  it("a divalent atom (O/S) has only slot 1 — straight through, the correct ether convention", () => {
    const valency = 2;
    const angleIn = 45;
    const slot1 = displayed.childAngle({ angleIn, grandAngleIn: null, slot: 1, valency });
    expect(slot1).toBe(angleIn);
  });
});

describe("displayed.label", () => {
  it("labels every atom with its bare element symbol, never bundling hydrogens", () => {
    const spec = displayed.label({ id: "0", element: "C", bonds: [] }, { hydrogenCount: 3, angleIn: null });
    expect(spec).toEqual({ main: "C", hydrogenCount: 0, hydrogenSide: "after" });
  });
});

describe("displayed style flags", () => {
  it("draws implicit hydrogens as their own positioned pseudo-atoms", () => {
    expect(displayed.rendersExplicitHydrogens).toBe(true);
  });
});
