/**
 * Trigger label for the ring dropdown. Collapsing ring sizes into a menu
 * means the toolbar no longer shows a pressed button for the armed size at a
 * glance, so the trigger takes over that job by naming what's held.
 */
export function ringMenuLabel(activeRing: { size: number; aromatic: boolean } | null): string {
  if (!activeRing) return "Rings";
  return activeRing.aromatic ? "Benzene" : `Ring ${activeRing.size}`;
}
