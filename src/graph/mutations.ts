import type { Atom, BondOrder, Element, MoleculeGraph } from "./types";

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
 * branch" deletion model). Works for both a plain chain tip and a ring atom:
 * removing a ring atom just shortens the ring, since the rest of it stays
 * reachable from the root via the other way round.
 */
export function deleteAtomSubtree(graph: MoleculeGraph, atomId: string): MoleculeGraph {
  if (atomId === graph.rootId) throw new Error("Cannot delete the seed atom");
  getAtom(graph, atomId);

  const withoutAtom = graph.atoms
    .filter((a) => a.id !== atomId)
    .map((a) => ({ ...a, bonds: a.bonds.filter((b) => b.to !== atomId) }));

  const reachable = reachableFrom(withoutAtom, graph.rootId);
  return { ...graph, atoms: withoutAtom.filter((a) => reachable.has(a.id)) };
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
