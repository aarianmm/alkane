import { PERIODIC_TABLE, type Atom, type BondOrder, type Element, type MoleculeGraph } from "./types";
import { addAtomFromStub } from "./mutations";
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
 * Whether the group's attachment atom has room to carry a parent bond of
 * `order` on top of its own fixed internal structure, without the atom
 * ending up hypervalent -- with one deliberate carve-out. Nitro's nitrogen
 * already spends 4 of its "budget" on the two N=O bonds before any parent
 * bond is even considered, which is 1 over nitrogen's nominal valency (3):
 * a plain `internalUsed + order <= valency` check would reject *every*
 * placement of nitro, including the only one the engine actually accepts
 * (a single R-N bond, for a legal total of 5). So nitro is special-cased to
 * accept exactly that one legal order instead of being run through the
 * generic arithmetic at all.
 */
function canAttachmentCarryOrder(spec: FunctionalGroupSpec, order: BondOrder): boolean {
  if (spec.id === "nitro") return order === 1;
  const attachmentElement = spec.atoms[0].element;
  const internalUsed = attachmentInternalUsedValency(spec);
  return internalUsed + order <= PERIODIC_TABLE[attachmentElement].valency;
}

/** The lowest slot ordinal not already occupied by one of parentId's children -- mirrors mutations.ts's private helper of the same name; small enough to duplicate rather than export just for this. */
function nextFreeSlot(graph: MoleculeGraph, parentId: string): number {
  const used = new Set(
    graph.atoms.filter((a) => a.parentId === parentId).map((a) => a.slotFromParent!),
  );
  let slot = 1;
  while (used.has(slot)) slot++;
  return slot;
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
 * `replaceAtomWithFunctionalGroup`) is free to drop or re-home every other
 * bond but must always keep the path back to the root.
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

/** A displaced neighbor (real bond, not implicit H) that must be either re-homed onto the finished group or dropped along with everything under it. */
interface DisplacedBranch {
  to: string;
  order: BondOrder;
  subtreeIds: Set<string>;
}

/** Every atom reachable from `startId` without stepping through `excludeId` -- a whole branch's worth of atoms, used both to cost a branch (for the drop/keep tie-break) and to carry it wholesale when it's re-homed. */
function subtreeExcluding(graph: MoleculeGraph, startId: string, excludeId: string): Set<string> {
  const byId = new Map(graph.atoms.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const stack = [startId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const bond of byId.get(id)?.bonds ?? []) {
      if (bond.to !== excludeId && !seen.has(bond.to)) stack.push(bond.to);
    }
  }
  return seen;
}

/** Every size-`k` subset of `{0, ..., n-1}`, as index arrays. `n` is always small here (bounded by an atom's own valency, at most 4), so a plain recursive enumeration is fine. */
function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  function build(start: number, chosen: number[]) {
    if (chosen.length === k) {
      result.push([...chosen]);
      return;
    }
    for (let i = start; i < n; i++) {
      chosen.push(i);
      build(i + 1, chosen);
      chosen.pop();
    }
  }
  build(0, []);
  return result;
}

/**
 * Whether every item in `items` can be assigned to some host with enough
 * spare valency left for its bond order -- a multi-bin packing feasibility
 * check, small enough (a handful of items and hosts, each capacity <= 3) for
 * plain backtracking. Returns the assignment itself (item id -> host id) so
 * the caller doesn't have to re-derive it.
 */
function packAssignment(
  items: { to: string; order: BondOrder }[],
  hostIds: string[],
  hostSpares: number[],
): Map<string, string> | null {
  const spares = [...hostSpares];
  const assignment = new Map<string, string>();

  function backtrack(index: number): boolean {
    if (index === items.length) return true;
    const item = items[index];
    for (let h = 0; h < hostIds.length; h++) {
      if (spares[h] >= item.order) {
        spares[h] -= item.order;
        assignment.set(item.to, hostIds[h]);
        if (backtrack(index + 1)) return true;
        spares[h] += item.order;
        assignment.delete(item.to);
      }
    }
    return false;
  }

  return backtrack(0) ? assignment : null;
}

/**
 * Decides which displaced branches survive a replacement, and where each
 * lands. The only objective is maximizing how many branches survive (not
 * how many atoms, and not any notion of which bond "matters" more) --
 * dropping is otherwise unranked, so ties are broken by dropping whichever
 * combination of branches is cheapest (fewest total atoms), mirroring
 * `pruneToFitValency`'s own tie-break. Checked from "drop nothing" upward
 * so the first feasible combination found is a maximum: this can't reuse
 * `pruneToFitValency` itself, since that helper only ever drops a branch
 * outright and has no notion of re-homing one onto a *different* atom.
 */
function chooseSurvivors(
  branches: DisplacedBranch[],
  hostIds: string[],
  hostSpares: number[],
): Map<string, string> {
  const items = branches.map((b) => ({ to: b.to, order: b.order, cost: b.subtreeIds.size }));
  const totalCost = (indices: number[]) => indices.reduce((sum, i) => sum + items[i].cost, 0);

  for (let numDropped = 0; numDropped <= items.length; numDropped++) {
    const dropCombos = combinations(items.length, numDropped).sort(
      (a, b) => totalCost(a) - totalCost(b),
    );
    for (const dropIdx of dropCombos) {
      const dropSet = new Set(dropIdx);
      const kept = items.filter((_, i) => !dropSet.has(i));
      const assignment = packAssignment(kept, hostIds, hostSpares);
      if (assignment) return assignment;
    }
  }
  return new Map();
}

/**
 * Replaces the carbon at `atomId` in place with `groupId`, preserving as
 * many of its existing real bonds as the finished group has room for.
 * All-or-nothing and never partially applied: returns `graph` unchanged
 * through `canReplaceWithGroup`'s gate (wrong element, or the attachment
 * atom genuinely can't carry the parent bond's order).
 *
 * The approach: strip every one of the target's non-parent branches out of
 * the graph entirely (each carries its own whole subtree with it), retype
 * the target to the group's attachment element, then grow the rest of the
 * group's atoms off it from that clean slate -- this is what gives the new
 * fragment atoms correct, lowest-first slot numbers, unconfused by the
 * removed branches' old ones. Every atom in the finished fragment (the
 * target included -- e.g. an aldehyde's own carbon still has a free slot)
 * is then a candidate host for re-homing a branch back on, per
 * `chooseSurvivors`; whatever doesn't fit anywhere just stays stripped.
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
  const parentOrder = parentId ? bondOrderBetween(graph, atomId, parentId) : undefined;

  const branches: DisplacedBranch[] = target.bonds
    .filter((b) => b.to !== parentId)
    .map((b) => ({ to: b.to, order: b.order, subtreeIds: subtreeExcluding(graph, b.to, atomId) }));
  const allBranchIds = new Set(branches.flatMap((b) => [...b.subtreeIds]));

  const stripped: MoleculeGraph = {
    ...graph,
    atoms: graph.atoms
      .filter((a) => !allBranchIds.has(a.id))
      .map((a) =>
        a.id === atomId
          ? {
              ...a,
              element: spec.atoms[0].element,
              bonds: parentId ? [{ to: parentId, order: parentOrder! }] : [],
            }
          : a,
      ),
  };

  const { graph: withFragment, fragmentIds } = growFragmentAtoms(stripped, atomId, spec);

  const hostSpares = fragmentIds.map((id) => openSlotCount(findAtomById(withFragment, id)!));
  const survivors = chooseSurvivors(branches, fragmentIds, hostSpares);

  let finalGraph = withFragment;
  for (const branch of branches) {
    const hostId = survivors.get(branch.to);
    if (!hostId) continue; // no spare room anywhere in the finished group -- dropped, subtree and all

    const slot = nextFreeSlot(finalGraph, hostId);
    const subtreeAtoms = graph.atoms.filter((a) => branch.subtreeIds.has(a.id));
    const rehomedAtoms: Atom[] = subtreeAtoms.map((a) =>
      a.id === branch.to
        ? {
            ...a,
            parentId: hostId,
            slotFromParent: slot,
            bonds: a.bonds.map((b) => (b.to === atomId ? { to: hostId, order: branch.order } : b)),
          }
        : a,
    );

    finalGraph = {
      ...finalGraph,
      atoms: [
        ...finalGraph.atoms.map((a) =>
          a.id === hostId ? { ...a, bonds: [...a.bonds, { to: branch.to, order: branch.order }] } : a,
        ),
        ...rehomedAtoms,
      ],
    };
  }

  return finalGraph;
}
