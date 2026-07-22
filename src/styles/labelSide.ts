/**
 * Which side of the element symbol bundled hydrogens render on. The design
 * rule: hydrogens go on the side *away* from the horizontal bonds, so a chain
 * reads like the classic condensed formula — prefix ("H3C-") iff the atom has
 * at least one horizontal-ish bond and every horizontal-ish bond leaves
 * eastward (a left-hand chain end); suffix ("-CH3") otherwise, including
 * vertical-branch atoms and the bare seed atom (no bonds -> "CH4").
 *
 * Horizontal-ish means |dx| >= |dy|, the same test clipDistance uses. Both
 * styles that call this only ever produce bond angles whose |cos| is 0, or
 * ~0.866 apart from |sin| (multiples of 90 in Structural, of 30-but-never-60
 * in Skeletal), so the classification is never ambiguous.
 */
export function hydrogenSideFromBonds(bondAngles: number[]): "before" | "after" {
  let sawHorizontal = false;
  for (const angle of bondAngles) {
    const radians = (angle * Math.PI) / 180;
    const dx = Math.cos(radians);
    const dy = Math.sin(radians);
    if (Math.abs(dx) < Math.abs(dy)) continue; // vertical-ish bond: irrelevant to the side
    sawHorizontal = true;
    if (dx < 0) return "after"; // any westward bond means text must not sit to the west
  }
  return sawHorizontal ? "before" : "after";
}
