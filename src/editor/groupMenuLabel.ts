import { FUNCTIONAL_GROUPS, type FunctionalGroupId } from "../graph/functionalGroups";

/**
 * Trigger label for the functional-group dropdown, mirroring `ringMenuLabel`:
 * collapsing the vocabulary into a menu means the toolbar no longer shows a
 * pressed button for the armed group at a glance, so the trigger takes over
 * that job by naming what's held.
 */
export function groupMenuLabel(activeGroupId: FunctionalGroupId | null): string {
  if (!activeGroupId) return "Groups";
  return FUNCTIONAL_GROUPS[activeGroupId].label;
}
