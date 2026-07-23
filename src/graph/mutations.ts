import { PERIODIC_TABLE, type Atom, type BondOrder, type Element, type MoleculeGraph } from "./types";
import { canInsertRing, findRing, hasRing, openSlotCount, usedValency } from "./queries";

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
 * Trims the lowest-priority bonds off `atomId` until its used valency fits
 * within `targetValency` — the shared "make this atom legal again after its
 * element/valency shrank" primitive, reused by both the element-replace and
 * (later) bond-order-replace features. The parent edge (the bond back toward
 * root) is never touched, so the atom always keeps its path to root; every
 * other bond is a candidate.
 *
 * Each cut is applied with `deleteBond`, so it inherits that function's
 * ring-aware behavior for free: cutting a ring bond just reopens the ring
 * (nothing is disconnected, since the rest of the ring is still reachable the
 * other way around), while cutting a plain tree bond prunes that whole
 * branch, exactly like `deleteAtomSubtree`. Candidates are therefore ranked
 * by how many atoms a cut would actually cost (cheapest first, so ring bonds
 * and small leaf branches go before anything substantial), tie-broken by
 * preferring the highest slot ordinal — the least-primary, most branch-like
 * attachment — so the main chain continuation (slot 1) survives longest.
 *
 * A no-op (valency already fits) returns `graph` itself unchanged. If the
 * atom runs out of trimmable bonds before reaching the target (only the
 * parent edge is left, and its own order still overshoots), pruning stops
 * there — this never touches the parent bond's order, which is outside this
 * helper's scope.
 */
export function pruneToFitValency(
  graph: MoleculeGraph,
  atomId: string,
  targetValency: number,
): MoleculeGraph {
  let current = graph;

  while (usedValency(getAtom(current, atomId)) > targetValency) {
    const atom = getAtom(current, atomId);
    const candidates = atom.bonds.filter((bond) => bond.to !== atom.parentId);
    if (candidates.length === 0) break;

    let bestTo: string | null = null;
    let bestCost = Infinity;
    let bestSlot = -Infinity;
    for (const bond of candidates) {
      const without = deleteBond(current, atomId, bond.to);
      const cost = current.atoms.length - without.atoms.length;
      const neighbor = getAtom(current, bond.to);
      const slot = neighbor.parentId === atomId ? (neighbor.slotFromParent ?? 0) : Infinity;

      const better =
        bestTo === null ||
        cost < bestCost ||
        (cost === bestCost && slot > bestSlot) ||
        (cost === bestCost && slot === bestSlot && Number(bond.to) > Number(bestTo));
      if (better) {
        bestTo = bond.to;
        bestCost = cost;
        bestSlot = slot;
      }
    }

    current = deleteBond(current, atomId, bestTo!);
  }

  return current;
}

/**
 * Retypes `atomId` to `element`, first pruning whatever branches don't fit
 * the new element's valency so the atom never ends up hypervalent. Bonds
 * that still fit are left untouched. This is the click-to-replace counterpart
 * to `RETYPE_SELECTED_ATOM`, which deliberately skips pruning.
 */
export function retypeAtomWithPrune(
  graph: MoleculeGraph,
  atomId: string,
  element: Element,
): MoleculeGraph {
  const pruned = pruneToFitValency(graph, atomId, PERIODIC_TABLE[element].valency);
  return setAtomElement(pruned, atomId, element);
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

  const neededOpen = aromatic ? 3 : 2;
  const pruned = pruneToFitValency(graph, atomId, PERIODIC_TABLE.C.valency - neededOpen);
  if (!canInsertRing(pruned, atomId, aromatic)) return graph;

  return addRing(pruned, atomId, size, aromatic);
}
