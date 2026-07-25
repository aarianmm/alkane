import { PERIODIC_TABLE, type BondOrder, type Element, type MoleculeGraph } from "./types";
import { addAtomFromStub, pruneToFitValency, setAtomElement } from "./mutations";
import { bondOrderBetween, findAtomById, openSlotCount } from "./queries";

/**
 * The carbon-based functional groups the naming engine actually recognizes.
 * Kept to exactly this vocabulary -- anything else (e.g. sulfonic acids,
 * esters as a single dropped-in group) isn't nameable, so isn't offered here.
 */
export type FunctionalGroupId =
  | "carboxylicAcid"
  | "acylChloride"
  | "amide"
  | "nitrile"
  | "aldehyde"
  | "hydroxyl"
  | "thiol"
  | "amine"
  | "nitro"
  | "methoxy";

interface GroupAtomSpec {
  element: Element;
  /**
   * Index (into this same spec's `atoms` array) of the fragment atom this
   * one bonds back to. Undefined only for index 0, the group's attachment
   * atom -- its "parent" is whatever real atom the group is being placed or
   * replaced onto, supplied by the caller rather than baked into the spec.
   */
  parentIndex?: number;
  /** Bond order to that fragment parent. Undefined (and unused) for index 0. */
  bondOrder?: BondOrder;
}

interface FunctionalGroupSpec {
  id: FunctionalGroupId;
  /** Human-readable name for the toolbar. */
  label: string;
  /** The group's atoms, index 0 always the attachment point. Every fragment in this vocabulary happens to be a simple tree rooted there -- no group needs a ring or a cross-link. */
  atoms: GroupAtomSpec[];
}

/**
 * Every group as a small atom-fragment template. Bond orders/atom counts
 * here are exactly what makes each formula legal (see the module-level
 * comment above `canAttachmentCarryOrder` for the one deliberate exception,
 * nitro). Order within `atoms` only matters in that index 0 is the
 * attachment point and every other entry's `parentIndex` must refer to an
 * already-listed atom.
 */
export const FUNCTIONAL_GROUPS: Record<FunctionalGroupId, FunctionalGroupSpec> = {
  carboxylicAcid: {
    id: "carboxylicAcid",
    label: "Carboxylic acid",
    atoms: [
      { element: "C" },
      { element: "O", parentIndex: 0, bondOrder: 2 }, // =O
      { element: "O", parentIndex: 0, bondOrder: 1 }, // -OH (the H is just its one open slot)
    ],
  },
  acylChloride: {
    id: "acylChloride",
    label: "Acyl chloride",
    atoms: [
      { element: "C" },
      { element: "O", parentIndex: 0, bondOrder: 2 },
      { element: "Cl", parentIndex: 0, bondOrder: 1 },
    ],
  },
  amide: {
    id: "amide",
    label: "Amide",
    atoms: [
      { element: "C" },
      { element: "O", parentIndex: 0, bondOrder: 2 },
      { element: "N", parentIndex: 0, bondOrder: 1 }, // -NH2, both H's implicit
    ],
  },
  nitrile: {
    id: "nitrile",
    label: "Nitrile",
    atoms: [{ element: "C" }, { element: "N", parentIndex: 0, bondOrder: 3 }],
  },
  aldehyde: {
    id: "aldehyde",
    label: "Aldehyde",
    atoms: [{ element: "C" }, { element: "O", parentIndex: 0, bondOrder: 2 }],
  },
  hydroxyl: {
    id: "hydroxyl",
    label: "Hydroxyl",
    atoms: [{ element: "O" }],
  },
  thiol: {
    id: "thiol",
    label: "Thiol",
    atoms: [{ element: "S" }],
  },
  amine: {
    id: "amine",
    label: "Amine",
    atoms: [{ element: "N" }],
  },
  // The engine's one legal hypervalent case: R-N(=O)(=O), a neutral nitrogen
  // deliberately past its nominal valency of 3 (1 to R + 2 + 2 = 5). See
  // canAttachmentCarryOrder below for how that exception is threaded through
  // rather than "fixed" by any generic valency check.
  nitro: {
    id: "nitro",
    label: "Nitro",
    atoms: [
      { element: "N" },
      { element: "O", parentIndex: 0, bondOrder: 2 },
      { element: "O", parentIndex: 0, bondOrder: 2 },
    ],
  },
  methoxy: {
    id: "methoxy",
    label: "Methoxy",
    atoms: [{ element: "O" }, { element: "C", parentIndex: 0, bondOrder: 1 }],
  },
};

/** Display order for the toolbar menu -- roughly the order they're taught in. */
export const FUNCTIONAL_GROUP_IDS: FunctionalGroupId[] = [
  "hydroxyl",
  "amine",
  "thiol",
  "aldehyde",
  "carboxylicAcid",
  "acylChloride",
  "amide",
  "nitrile",
  "nitro",
  "methoxy",
];

/** Sum of bond orders the attachment atom (index 0) spends on its own fragment children -- i.e. everything except whatever parent bond it ends up carrying from outside the group. */
function attachmentInternalUsedValency(spec: FunctionalGroupSpec): number {
  return spec.atoms.reduce(
    (sum, atomSpec, i) => (i > 0 && atomSpec.parentIndex === 0 ? sum + atomSpec.bondOrder! : sum),
    0,
  );
}

/**
 * The attachment atom's total legal used valency -- parent bond, group-
 * internal bonds, and any retained outside branches all counted together.
 * Ordinarily just the attachment element's nominal valency, with one
 * deliberate carve-out: nitro's nitrogen is the engine's one legal
 * hypervalent form, R-N(=O)(=O), which already runs to 5 (1 to R + 2 + 2)
 * rather than nitrogen's nominal 3. Budgeting it at 5 up front -- instead of
 * special-casing every caller that would otherwise reject it -- means the
 * ordinary arithmetic in `canAttachmentCarryOrder` and
 * `replaceAtomWithFunctionalGroup` just works for nitro too, with no
 * separate branch.
 */
function attachmentTotalBudget(spec: FunctionalGroupSpec): number {
  if (spec.id === "nitro") return 5;
  return PERIODIC_TABLE[spec.atoms[0].element].valency;
}

/**
 * Whether the group's attachment atom has room to carry a parent bond of
 * `order` on top of its own fixed internal structure, without the atom
 * ending up hypervalent (see `attachmentTotalBudget` for how nitro's one
 * legal hypervalent form is folded into this same check rather than
 * special-cased here).
 */
function canAttachmentCarryOrder(spec: FunctionalGroupSpec, order: BondOrder): boolean {
  return attachmentInternalUsedValency(spec) + order <= attachmentTotalBudget(spec);
}

/** Grows a group's non-attachment atoms (spec index 1+) off an attachment atom that already exists in `graph` at `attachmentId`. Composes `addAtomFromStub` per fragment atom, so ids/slots/nextId all come out consistent for free. */
function growFragmentAtoms(
  graph: MoleculeGraph,
  attachmentId: string,
  spec: FunctionalGroupSpec,
): { graph: MoleculeGraph; fragmentIds: string[] } {
  let current = graph;
  const fragmentIds = [attachmentId];
  for (let i = 1; i < spec.atoms.length; i++) {
    const atomSpec = spec.atoms[i];
    const fragmentParentId = fragmentIds[atomSpec.parentIndex!];
    current = addAtomFromStub(current, fragmentParentId, atomSpec.element, atomSpec.bondOrder!);
    fragmentIds.push(String(current.nextId - 1));
  }
  return { graph: current, fragmentIds };
}

/**
 * Grows `groupId` off an open stub on `parentId` -- the group's attachment
 * atom takes the stub's slot via a single bond (the only order a fresh
 * "hold and place" gesture ever uses), and the rest of the group's atoms
 * hang off that attachment atom in turn. The direct analogue of `addRing`
 * for a pending ring. A no-op (returns `graph` unchanged) when the parent
 * has no open slot left for even that one linking bond -- in practice the
 * UI never offers a stub where this would happen, but the check is kept
 * here too so the mutation is safe to call directly.
 */
export function addFunctionalGroupFromStub(
  graph: MoleculeGraph,
  parentId: string,
  groupId: FunctionalGroupId,
): MoleculeGraph {
  const parent = findAtomById(graph, parentId);
  if (!parent) throw new Error(`Unknown atom id: ${parentId}`);
  if (openSlotCount(parent) < 1) return graph;

  const spec = FUNCTIONAL_GROUPS[groupId];
  const withAttachment = addAtomFromStub(graph, parentId, spec.atoms[0].element, 1);
  const attachmentId = String(withAttachment.nextId - 1);
  return growFragmentAtoms(withAttachment, attachmentId, spec).graph;
}

/**
 * Whether `atomId` is a legal target for replacing-in-place with `groupId`.
 * Only a carbon atom may be replaced -- these are all carbon-based
 * functional groups, substituents that stand in for a carbon-skeleton
 * position, not a general "swap any atom for any group" operation (the same
 * restriction `canInsertRing` places on ring anchors). Beyond that, the
 * group's attachment atom must be able to carry the target's existing
 * parent bond at its current order -- the one part of the target's role
 * that's never negotiable, since bond-preservation (see
 * `replaceAtomWithFunctionalGroup`) is free to drop every other bond but must
 * always keep the path back to the root.
 */
export function canReplaceWithGroup(
  graph: MoleculeGraph,
  atomId: string,
  groupId: FunctionalGroupId,
): boolean {
  const atom = findAtomById(graph, atomId);
  if (!atom || atom.element !== "C") return false;
  if (!atom.parentId) return true; // the seed atom has no parent edge to preserve

  const parentOrder = bondOrderBetween(graph, atomId, atom.parentId)!;
  return canAttachmentCarryOrder(FUNCTIONAL_GROUPS[groupId], parentOrder);
}

/**
 * Replaces the carbon at `atomId` in place with `groupId`. All-or-nothing
 * and never partially applied: returns `graph` unchanged through
 * `canReplaceWithGroup`'s gate (wrong element, or the attachment atom
 * genuinely can't carry the parent bond's order).
 *
 * Every one of the target's other existing bonds (i.e. not the parent edge)
 * is either kept exactly where it already sits or dropped along with its
 * whole subtree -- a bond is never moved onto a different atom of the
 * inserted fragment. What survives is whatever fits: the group's own
 * internal bonds are fixed by the vocabulary and always claim their share of
 * the attachment atom's valency first, so `pruneToFitValency` (protecting
 * the parent edge, and preferring to drop the cheapest branches first, same
 * as it does for a plain element retype) trims the target's other bonds down
 * to whatever's left over. Carboxylic acid's attachment carbon, for
 * instance, already spends 3 of its 4 slots on the group's own `=O` and
 * `-OH`, leaving room for only the parent edge -- so replacing a carbon that
 * also carried other substituents with carboxylic acid drops every one of
 * them.
 *
 * The prune runs before the target atom is retyped (its element doesn't
 * affect the arithmetic -- `pruneToFitValency` is only ever told the target
 * valency to prune down to) and before the rest of the group's atoms are
 * grown off it, so those fragment atoms land on whatever slots the surviving
 * branches left open.
 */
export function replaceAtomWithFunctionalGroup(
  graph: MoleculeGraph,
  atomId: string,
  groupId: FunctionalGroupId,
): MoleculeGraph {
  if (!canReplaceWithGroup(graph, atomId, groupId)) return graph;

  const spec = FUNCTIONAL_GROUPS[groupId];
  const target = findAtomById(graph, atomId)!;
  const parentId = target.parentId;

  const spareForOtherBonds = attachmentTotalBudget(spec) - attachmentInternalUsedValency(spec);
  const pruned = pruneToFitValency(graph, atomId, spareForOtherBonds, parentId);

  const retyped = setAtomElement(pruned, atomId, spec.atoms[0].element);
  return growFragmentAtoms(retyped, atomId, spec).graph;
}
