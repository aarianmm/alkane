import { PERIODIC_TABLE, type Atom, type BondOrder, type MoleculeGraph } from "./types";

export function findAtomById(graph: MoleculeGraph, id: string): Atom | undefined {
  return graph.atoms.find((a) => a.id === id);
}

export function bondOrderBetween(
  graph: MoleculeGraph,
  atomIdA: string,
  atomIdB: string,
): BondOrder | undefined {
  return findAtomById(graph, atomIdA)?.bonds.find((b) => b.to === atomIdB)?.order;
}

export function usedValency(atom: Atom): number {
  return atom.bonds.reduce((sum, bond) => sum + bond.order, 0);
}

/** How many open bond slots an atom has left, per its nominal valency. */
export function openSlotCount(atom: Atom): number {
  return Math.max(0, PERIODIC_TABLE[atom.element].valency - usedValency(atom));
}

/**
 * Whether the graph already contains a ring. A connected graph with V atoms
 * has exactly V-1 edges iff it's a tree; any more means a cycle exists. The
 * engine only supports one ring per molecule, so this gates further closures.
 */
export function hasRing(graph: MoleculeGraph): boolean {
  const edgeCount = graph.atoms.reduce((sum, a) => sum + a.bonds.length, 0) / 2;
  return edgeCount > graph.atoms.length - 1;
}

/** Shortest path between two atoms (unique while the graph is still a tree). */
export function pathBetween(graph: MoleculeGraph, fromId: string, toId: string): string[] {
  const byId = new Map(graph.atoms.map((a) => [a.id, a]));
  const parent = new Map<string, string | null>([[fromId, null]]);
  const queue = [fromId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toId) break;
    for (const bond of byId.get(current)?.bonds ?? []) {
      if (!parent.has(bond.to)) {
        parent.set(bond.to, current);
        queue.push(bond.to);
      }
    }
  }

  if (!parent.has(toId)) return [];
  const path: string[] = [];
  for (let step: string | null = toId; step !== null; step = parent.get(step) ?? null) {
    path.unshift(step);
  }
  return path;
}

/**
 * Whether clicking atomB while atomA is selected should close a ring, per
 * the engine's cyclic-path scope: exactly one ring, all-carbon, size 3-10.
 */
export function isRingClosureLegal(graph: MoleculeGraph, atomIdA: string, atomIdB: string): boolean {
  if (atomIdA === atomIdB) return false;
  if (hasRing(graph)) return false;

  const a = findAtomById(graph, atomIdA);
  const b = findAtomById(graph, atomIdB);
  if (!a || !b) return false;
  if (openSlotCount(a) < 1 || openSlotCount(b) < 1) return false;
  if (a.bonds.some((bond) => bond.to === atomIdB)) return false;

  // path.length is always >= 3 here: length 1 is excluded by the atomIdA ===
  // atomIdB check above, and length 2 (adjacent atoms) is excluded by the
  // already-bonded check above.
  const path = pathBetween(graph, atomIdA, atomIdB);
  if (path.length > 10) return false;

  return path.every((id) => findAtomById(graph, id)?.element === "C");
}
