import { PERIODIC_TABLE, type Atom, type BondOrder, type Element, type MoleculeGraph } from "./types";
import { findRing, hasRing, openSlotCount, usedValency } from "./queries";

function getAtom(graph: MoleculeGraph, id: string): Atom {
  const atom = graph.atoms.find((a) => a.id === id);
  if (!atom) throw new Error(`Unknown atom id: ${id}`);
  return atom;
}

function replaceAtom(
  graph: MoleculeGraph,
  id: string,
  updater: (atom: Atom) => Atom,
): MoleculeGraph {
  return { ...graph, atoms: graph.atoms.map((a) => (a.id === id ? updater(a) : a)) };
}

/** Atoms reachable from rootId, walking bonds. Used to find what a deletion disconnects. */
function reachableFrom(atoms: Atom[], rootId: string): Set<string> {
  const byId = new Map(atoms.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const bond of byId.get(id)?.bonds ?? []) {
      if (!seen.has(bond.to)) stack.push(bond.to);
    }
  }
  return seen;
}

/** The lowest slot ordinal not already occupied by one of parentId's children. */
function nextFreeSlot(graph: MoleculeGraph, parentId: string): number {
  const used = new Set(
    graph.atoms.filter((a) => a.parentId === parentId).map((a) => a.slotFromParent!),
  );
  let slot = 1;
  while (used.has(slot)) slot++;
  return slot;
}

/** Grows a new atom off an existing atom's open stub — the core drawing gesture. */
export function addAtomFromStub(
  graph: MoleculeGraph,
  parentId: string,
  element: Element,
  bondOrder: BondOrder,
): MoleculeGraph {
  getAtom(graph, parentId);
  const newId = String(graph.nextId);
  const newAtom: Atom = {
    id: newId,
    element,
    bonds: [{ to: parentId, order: bondOrder }],
    parentId,
    slotFromParent: nextFreeSlot(graph, parentId),
  };

  const withParentBond = replaceAtom(graph, parentId, (parent) => ({
    ...parent,
    bonds: [...parent.bonds, { to: newId, order: bondOrder }],
  }));

  return {
    ...withParentBond,
    atoms: [...withParentBond.atoms, newAtom],
    nextId: graph.nextId + 1,
  };
}

/** Bonds two existing atoms together — how a ring gets closed. */
export function closeRingBond(
  graph: MoleculeGraph,
  atomIdA: string,
  atomIdB: string,
  order: BondOrder,
): MoleculeGraph {
  if (atomIdA === atomIdB) throw new Error("Cannot bond an atom to itself");
  const a = getAtom(graph, atomIdA);
  getAtom(graph, atomIdB);
  if (a.bonds.some((b) => b.to === atomIdB)) {
    throw new Error(`Atoms ${atomIdA} and ${atomIdB} are already bonded`);
  }

  let next = replaceAtom(graph, atomIdA, (atom) => ({
    ...atom,
    bonds: [...atom.bonds, { to: atomIdB, order }],
  }));
  next = replaceAtom(next, atomIdB, (atom) => ({
    ...atom,
    bonds: [...atom.bonds, { to: atomIdA, order }],
  }));
  return next;
}

/**
 * Grows a ring of `size` carbons through `anchorId` — the toolbar's one-click
 * insertion, and the only way a cycle enters the graph. Composes
 * `addAtomFromStub` for the chain plus `closeRingBond` for the closing edge;
 * `aromatic` (size 6 only) stamps the Kekule alternation (2,1,2,1,2 then
 * closing 1) so every ring atom ends up with exactly one single + one double
 * ring bond. Display never shows this Kekule pattern for benzene — that's a
 * derived rendering choice, not stored here (see graph/queries.ts's
 * isAromaticRing and MoleculeEditor).
 */
export function addRing(
  graph: MoleculeGraph,
  anchorId: string,
  size: number,
  aromatic: boolean,
): MoleculeGraph {
  const anchor = getAtom(graph, anchorId);
  if (anchor.element !== "C") throw new Error("Rings can only be inserted through a carbon atom");
  if (size < 3 || size > 10) throw new Error("Ring size must be between 3 and 10");
  if (aromatic && size !== 6) throw new Error("Aromatic rings must be 6-membered");
  if (hasRing(graph)) throw new Error("The molecule already contains a ring");
  if (openSlotCount(anchor) < (aromatic ? 3 : 2)) {
    throw new Error("Anchor atom lacks the open valency for a ring");
  }

  // Bond order at alternation step i (0-indexed around the full n-bond
  // cycle): even steps double, odd steps single. Non-aromatic rings are all
  // single, order 1 throughout.
  const orderAt = (i: number): BondOrder => (aromatic && i % 2 === 0 ? 2 : 1);

  let current = graph;
  let previousId = anchorId;
  for (let i = 0; i < size - 1; i++) {
    const newId = String(current.nextId);
    current = addAtomFromStub(current, previousId, "C", orderAt(i));
    previousId = newId;
  }
  return closeRingBond(current, previousId, anchorId, orderAt(size - 1));
}

export function setAtomElement(graph: MoleculeGraph, atomId: string, element: Element): MoleculeGraph {
  getAtom(graph, atomId);
  return replaceAtom(graph, atomId, (atom) => ({ ...atom, element }));
}

/**
 * Changes a bond's order. Deliberately not clamped by valence — the only
 * hypervalent case in the supported vocabulary (nitro) is only reachable by
 * pushing a bond order past nominal valency after the atoms are placed. The
 * backend is the source of truth for what's actually a legal molecule.
 */
export function setBondOrder(
  graph: MoleculeGraph,
  atomIdA: string,
  atomIdB: string,
  order: BondOrder,
): MoleculeGraph {
  const a = getAtom(graph, atomIdA);
  getAtom(graph, atomIdB);
  if (!a.bonds.some((b) => b.to === atomIdB)) {
    throw new Error(`No bond between ${atomIdA} and ${atomIdB}`);
  }

  let next = replaceAtom(graph, atomIdA, (atom) => ({
    ...atom,
    bonds: atom.bonds.map((b) => (b.to === atomIdB ? { ...b, order } : b)),
  }));
  next = replaceAtom(next, atomIdB, (atom) => ({
    ...atom,
    bonds: atom.bonds.map((b) => (b.to === atomIdA ? { ...b, order } : b)),
  }));
  return next;
}

/**
 * Deletes an atom and everything reachable only through it (the "prune the
 * branch" deletion model). A ring atom has two ways back to the root — its
 * own chain and the ring-closing edge — so pruning just that one atom would
 * leave the rest of the ring dangling off the anchor as a pair of open
 * chains instead of disappearing. Deleting any ring atom (aromatic or not)
 * therefore removes the whole ring; everything else still only reachable
 * through it is pruned the same way as a plain chain tip.
 */
export function deleteAtomSubtree(graph: MoleculeGraph, atomId: string): MoleculeGraph {
  if (atomId === graph.rootId) throw new Error("Cannot delete the seed atom");
  getAtom(graph, atomId);

  const ring = findRing(graph);
  const toDelete =
    ring?.includes(atomId) ? new Set(ring.filter((id) => id !== graph.rootId)) : new Set([atomId]);

  const withoutAtoms = graph.atoms
    .filter((a) => !toDelete.has(a.id))
    .map((a) => ({ ...a, bonds: a.bonds.filter((b) => !toDelete.has(b.to)) }));

  const reachable = reachableFrom(withoutAtoms, graph.rootId);
  return { ...graph, atoms: withoutAtoms.filter((a) => reachable.has(a.id)) };
}

/**
 * The click-to-delete-mode step on a bond: drop its order by one, or sever it
 * outright once it's already single. A triple bond becomes double, a double
 * becomes single, and a single bond is removed via `deleteBond` (with its
 * usual ring-reopen / branch-prune behavior).
 */
export function decrementBondOrder(graph: MoleculeGraph, atomIdA: string, atomIdB: string): MoleculeGraph {
  const order = getAtom(graph, atomIdA).bonds.find((b) => b.to === atomIdB)?.order;
  if (order === undefined) throw new Error(`No bond between ${atomIdA} and ${atomIdB}`);

  if (order > 1) {
    return setBondOrder(graph, atomIdA, atomIdB, (order - 1) as BondOrder);
  }
  return deleteBond(graph, atomIdA, atomIdB);
}

/**
 * Deletes a bond between two atoms. If it's a ring-closing bond, both atoms
 * stay reachable via the rest of the ring, so only the edge is removed
 * (reopening the ring into a chain). Otherwise it's a tree bond, and removing
 * it prunes whichever side loses its connection to the root — the same
 * "prune the branch" rule as deleteAtomSubtree.
 */
export function deleteBond(graph: MoleculeGraph, atomIdA: string, atomIdB: string): MoleculeGraph {
  const a = getAtom(graph, atomIdA);
  getAtom(graph, atomIdB);
  if (!a.bonds.some((b) => b.to === atomIdB)) {
    throw new Error(`No bond between ${atomIdA} and ${atomIdB}`);
  }

  const edgeRemoved = graph.atoms.map((atom) => {
    if (atom.id === atomIdA) return { ...atom, bonds: atom.bonds.filter((b) => b.to !== atomIdB) };
    if (atom.id === atomIdB) return { ...atom, bonds: atom.bonds.filter((b) => b.to !== atomIdA) };
    return atom;
  });

  const reachable = reachableFrom(edgeRemoved, graph.rootId);
  if (reachable.size === edgeRemoved.length) {
    return { ...graph, atoms: edgeRemoved };
  }
  return { ...graph, atoms: edgeRemoved.filter((a) => reachable.has(a.id)) };
}

/**
 * Removes every bond from `atomId` to one of `toIds` in one shot (both
 * directions), then prunes whatever that disconnects from root — the
 * multi-edge generalization of `deleteBond`'s reachability check. Cutting a
 * subset of edges all at once, and only then checking what's still
 * reachable, is what makes this safe for a ring atom's two ring bonds:
 * severing either one alone just reopens the ring (nothing lost), but
 * severing *both* is what actually strands the rest of the ring, and that
 * interaction only shows up when the whole subset is removed together —
 * summing each edge's cost as if cut in isolation would miss it entirely.
 */
function removeBondsAndPrune(graph: MoleculeGraph, atomId: string, toIds: string[]): MoleculeGraph {
  const cut = new Set(toIds);
  const edgeRemoved = graph.atoms.map((a) => {
    if (a.id === atomId) return { ...a, bonds: a.bonds.filter((b) => !cut.has(b.to)) };
    if (cut.has(a.id)) return { ...a, bonds: a.bonds.filter((b) => b.to !== atomId) };
    return a;
  });

  const reachable = reachableFrom(edgeRemoved, graph.rootId);
  if (reachable.size === edgeRemoved.length) return { ...graph, atoms: edgeRemoved };
  return { ...graph, atoms: edgeRemoved.filter((a) => reachable.has(a.id)) };
}

/**
 * Trims the lowest-priority bonds off `atomId` until its used valency fits
 * within `targetValency` — the shared "make this atom legal again after its
 * element/valency shrank" primitive, reused by both the element-replace and
 * (later) bond-order-replace features. The parent edge (the bond back toward
 * root) is never touched, so the atom always keeps its path to root; every
 * other bond is a candidate.
 *
 * Candidates are trimmed as a single chosen *subset*, not one cheapest bond
 * at a time: a step-at-a-time greedy can be fooled into spending a cheap bond
 * first only to discover it still has to cut an expensive one anyway, when
 * cutting just the expensive one (whose order alone covers the whole
 * shortfall) would have kept more atoms around outright. Since candidates
 * top out at a handful (valency never exceeds 4), every subset is simply
 * tried: among those whose combined order closes the gap to `targetValency`,
 * the one costing the fewest atoms wins (via `removeBondsAndPrune`, so ring
 * bonds are costed correctly, interactions included); ties prefer cutting
 * fewer bonds, then the higher slot ordinals — the least-primary, most
 * branch-like attachments — so the main chain continuation (slot 1) survives
 * longest, then the lowest neighbor ids for determinism. If every candidate
 * together still doesn't close the gap, all of them are cut — the same
 * "stops there" exhaustion the old step-at-a-time version had.
 *
 * A no-op (valency already fits) returns `graph` itself unchanged.
 *
 * `protectedNeighborId`, when given, is excluded from the candidates exactly
 * like the parent edge — for `setBondOrderWithPrune`, which needs to free
 * room on an endpoint without any risk of the very bond it's raising being
 * the one that gets cut.
 */
export function pruneToFitValency(
  graph: MoleculeGraph,
  atomId: string,
  targetValency: number,
  protectedNeighborId?: string,
): MoleculeGraph {
  const atom = getAtom(graph, atomId);
  const deficit = usedValency(atom) - targetValency;
  if (deficit <= 0) return graph;

  const candidates = atom.bonds.filter(
    (bond) => bond.to !== atom.parentId && bond.to !== protectedNeighborId,
  );
  if (candidates.length === 0) return graph;

  const slotOf = (to: string): number => {
    const neighbor = getAtom(graph, to);
    return neighbor.parentId === atomId ? (neighbor.slotFromParent ?? 0) : Infinity;
  };

  type Choice = { toIds: string[]; cost: number };
  let best: Choice | null = null;
  const fullSet = candidates.map((b) => b.to);

  for (let mask = 1; mask < 1 << candidates.length; mask++) {
    const subset = candidates.filter((_, i) => mask & (1 << i));
    if (subset.reduce((sum, b) => sum + b.order, 0) < deficit) continue; // doesn't close the gap

    const toIds = subset.map((b) => b.to);
    const cost = graph.atoms.length - removeBondsAndPrune(graph, atomId, toIds).atoms.length;

    const better =
      best === null ||
      cost < best.cost ||
      (cost === best.cost && toIds.length < best.toIds.length) ||
      (cost === best.cost &&
        toIds.length === best.toIds.length &&
        Math.min(...toIds.map(slotOf)) > Math.min(...best.toIds.map(slotOf)));
    if (better) best = { toIds, cost };
  }

  return removeBondsAndPrune(graph, atomId, best?.toIds ?? fullSet);
}

/**
 * What a replacement occupant costs the atom it lands on. Every "replace this
 * atom with X" gesture — a different element, a ring, a functional group — is
 * the same arithmetic, and this is the only thing that varies between them:
 *
 *   - `budget` is the total used valency the atom is allowed once X is in
 *     place. Ordinarily the new occupant element's nominal valency; the one
 *     exception is nitro, whose nitrogen is the engine's single legal
 *     hypervalent form (see functionalGroups.ts).
 *   - `internalUsed` is how much of that budget X spends on bonds it brings
 *     with it, before any of the target's existing bonds are counted. A ring
 *     spends 2 (or 3, aromatic); carboxylic acid spends 3 on its own =O and
 *     -OH. A plain element spends nothing, which is why retyping an atom
 *     looked like a different operation for so long when it never was.
 *
 * Whatever's left over -- `spareForExistingBonds` -- is all the room the
 * target's current bonds get to share, and that single number drives both the
 * "may I?" predicate and the prune.
 */
export interface OccupantFootprint {
  budget: number;
  internalUsed: number;
}

/** A plain element: it brings no bonds of its own, so the whole budget is up for grabs. */
export function elementFootprint(element: Element): OccupantFootprint {
  return { budget: PERIODIC_TABLE[element].valency, internalUsed: 0 };
}

/** A ring anchored through the atom: two ring bonds, or three for the Kekule alternation an aromatic ring needs. */
export function ringFootprint(aromatic: boolean): OccupantFootprint {
  return { budget: PERIODIC_TABLE.C.valency, internalUsed: aromatic ? 3 : 2 };
}

/** Room left for the bonds the target atom already has -- its parent edge plus any substituents. */
export function spareForExistingBonds(footprint: OccupantFootprint): number {
  return footprint.budget - footprint.internalUsed;
}

/**
 * Trims `atomId`'s substituents down to the room `footprint` leaves them, and
 * reports whether the result actually fits. Returns `null` when it doesn't --
 * meaning the parent edge alone already overshoots, and since
 * `pruneToFitValency` may never cut the path back to root, no amount of
 * pruning can rescue it.
 *
 * That `null` is what makes every replacement all-or-nothing: the caller
 * returns the original graph and nothing is left partially pruned. It is also
 * the check the element-retype path used to be missing, which let a
 * double-bonded carbon become a valency-1 halogen still carrying that double
 * bond.
 */
export function pruneForOccupant(
  graph: MoleculeGraph,
  atomId: string,
  footprint: OccupantFootprint,
): MoleculeGraph | null {
  const spare = spareForExistingBonds(footprint);
  const pruned = pruneToFitValency(graph, atomId, spare);
  return usedValency(getAtom(pruned, atomId)) <= spare ? pruned : null;
}

/**
 * Whether `atomId` could host `footprint` at all -- the predicate form of
 * `pruneForOccupant`, for deciding up front whether to offer the gesture.
 * Deliberately answers the question *after* a hypothetical prune, since
 * dropping substituents to make room is a legitimate outcome; only the
 * un-cuttable parent edge can make a replacement genuinely impossible.
 */
export function canHostOccupant(
  graph: MoleculeGraph,
  atomId: string,
  footprint: OccupantFootprint,
): boolean {
  return pruneForOccupant(graph, atomId, footprint) !== null;
}

/**
 * Retypes `atomId` to `element`, first pruning whatever branches don't fit
 * the new element's valency so the atom never ends up hypervalent. Bonds
 * that still fit are left untouched. This is the click-to-replace counterpart
 * to `setAtomElement`, which deliberately skips pruning.
 *
 * A no-op (returns `graph` unchanged) when the atom's parent edge alone
 * outweighs the new element -- e.g. a double-bonded carbon retyped to a
 * halogen. Pruning can't cut a parent edge, so there is nothing to trim and
 * the only honest answer is to decline; the same all-or-nothing rule rings
 * and functional groups have always followed.
 */
export function retypeAtomWithPrune(
  graph: MoleculeGraph,
  atomId: string,
  element: Element,
): MoleculeGraph {
  const pruned = pruneForOccupant(graph, atomId, elementFootprint(element));
  if (!pruned) return graph;
  return setAtomElement(pruned, atomId, element);
}

/** Whether retyping `atomId` to `element` would succeed -- see `retypeAtomWithPrune` for when it wouldn't. */
export function canRetypeAtom(graph: MoleculeGraph, atomId: string, element: Element): boolean {
  return canHostOccupant(graph, atomId, elementFootprint(element));
}

/**
 * Replaces the carbon at `atomId` with a ring of `size` atoms, anchored where
 * it stood — pruning branches off it first if it doesn't already have the
 * open valency the ring needs (2 plain / 3 aromatic). Entirely a no-op,
 * returning `graph` unchanged, when the atom isn't a carbon, the molecule
 * already has a ring, or there still isn't enough room after pruning: this is
 * all-or-nothing, so a doomed attempt never leaves a partially-pruned atom
 * behind.
 */
export function replaceAtomWithRing(
  graph: MoleculeGraph,
  atomId: string,
  size: number,
  aromatic: boolean,
): MoleculeGraph {
  const atom = getAtom(graph, atomId);
  if (atom.element !== "C" || hasRing(graph)) return graph;

  const pruned = pruneForOccupant(graph, atomId, ringFootprint(aromatic));
  if (!pruned) return graph;

  return addRing(pruned, atomId, size, aromatic);
}

/**
 * Whether replacing `atomId` with a ring would succeed. Same two-part shape
 * as `canRetypeAtom` and `canReplaceWithGroup`: a domain rule about what may
 * host a ring at all (a carbon, in a molecule that hasn't already got one --
 * the engine supports a single ring), then the shared footprint arithmetic
 * for whether it fits.
 */
export function canReplaceAtomWithRing(
  graph: MoleculeGraph,
  atomId: string,
  aromatic: boolean,
): boolean {
  const atom = graph.atoms.find((a) => a.id === atomId);
  if (!atom || atom.element !== "C" || hasRing(graph)) return false;
  return canHostOccupant(graph, atomId, ringFootprint(aromatic));
}

/**
 * Changes bond (atomIdA, atomIdB) to `order`, the click-to-replace
 * counterpart to `setBondOrder`. Implicit hydrogens are just open valence
 * slots, so raising an order first consumes those for free; only an endpoint
 * with no open slots left (all its valency already spoken for by real bonds)
 * needs a branch pruned to make room, via `pruneToFitValency`. Lowering an
 * order never needs any of this — every atom just ends up with more open
 * slots than before.
 *
 * The bond being edited is never a candidate for its own prune: each
 * endpoint's prune call passes the *other* endpoint as `protectedNeighborId`,
 * so pruning only ever trims some other branch, never the edge under edit.
 *
 * A no-op (returns `graph` unchanged) when the order can't fit even after
 * pruning every other branch off both endpoints — e.g. raising a bond into
 * an atom whose parent edge alone already uses all its valency.
 */
export function setBondOrderWithPrune(
  graph: MoleculeGraph,
  atomIdA: string,
  atomIdB: string,
  order: BondOrder,
): MoleculeGraph {
  const a = getAtom(graph, atomIdA);
  getAtom(graph, atomIdB);
  const oldOrder = a.bonds.find((bond) => bond.to === atomIdB)?.order;
  if (oldOrder === undefined) throw new Error(`No bond between ${atomIdA} and ${atomIdB}`);

  if (order <= oldOrder) {
    return setBondOrder(graph, atomIdA, atomIdB, order);
  }

  // Raising: each endpoint's *other* bonds must fit within valency - order.
  // Its used valency right now still counts the edited bond at its old
  // order, so the equivalent target for pruneToFitValency (which looks at
  // total used valency) is valency - order + oldOrder.
  let pruned = graph;
  for (const [selfId, otherId] of [
    [atomIdA, atomIdB],
    [atomIdB, atomIdA],
  ] as const) {
    const valency = PERIODIC_TABLE[getAtom(pruned, selfId).element].valency;
    pruned = pruneToFitValency(pruned, selfId, valency - order + oldOrder, otherId);
  }

  const otherSumA = usedValency(getAtom(pruned, atomIdA)) - oldOrder;
  const otherSumB = usedValency(getAtom(pruned, atomIdB)) - oldOrder;
  const valencyA = PERIODIC_TABLE[getAtom(pruned, atomIdA).element].valency;
  const valencyB = PERIODIC_TABLE[getAtom(pruned, atomIdB).element].valency;
  if (otherSumA + order > valencyA || otherSumB + order > valencyB) {
    return graph; // degenerate: can't fit without cutting the edited bond itself
  }

  return setBondOrder(pruned, atomIdA, atomIdB, order);
}
