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

/** Every atom id on the path from `atomId` up to the root, via `parentId` — ignores any ring-closing bond. */
function pathToRoot(graph: MoleculeGraph, atomId: string): string[] {
  const byId = new Map(graph.atoms.map((a) => [a.id, a]));
  const path: string[] = [];
  let current: string | undefined = atomId;
  while (current !== undefined) {
    path.push(current);
    current = byId.get(current)?.parentId;
  }
  return path;
}

/**
 * The tree-only path between two atoms, via their nearest common ancestor.
 * Unlike `pathBetween`, this ignores any ring-closing bond even when one
 * connects the two atoms directly — needed by `findRing`, which is called
 * *after* the closing bond already exists, when a plain BFS would just take
 * that bond as a one-hop shortcut instead of walking the ring.
 */
function treePathBetween(graph: MoleculeGraph, atomIdA: string, atomIdB: string): string[] {
  const toRootA = pathToRoot(graph, atomIdA);
  const toRootB = pathToRoot(graph, atomIdB);
  const inB = new Set(toRootB);
  const splitA = toRootA.findIndex((id) => inB.has(id));
  const lca = toRootA[splitA];
  const downToB = toRootB.slice(0, toRootB.indexOf(lca)).reverse();
  return [...toRootA.slice(0, splitA + 1), ...downToB];
}

/**
 * The molecule's one ring, as an ordered atom-id cycle starting from the
 * atom nearest the root (the anchor the ring was grown through) — or null
 * for a plain chain. Derived fresh from the graph every time, like `hasRing`
 * above; no ring state is ever stored. This is a rendering/layout query, not
 * naming logic — the engine does its own independent ring detection for
 * IUPAC rules over the API; this exists only so the editor can lay the ring
 * out as a polygon and decide which bonds to draw.
 */
export function findRing(graph: MoleculeGraph): string[] | null {
  if (!hasRing(graph)) return null;
  const byId = new Map(graph.atoms.map((a) => [a.id, a]));

  const seen = new Set<string>();
  for (const atom of graph.atoms) {
    for (const bond of atom.bonds) {
      const key = [atom.id, bond.to].sort((a, b) => Number(a) - Number(b)).join("-");
      if (seen.has(key)) continue;
      seen.add(key);

      const neighbor = byId.get(bond.to)!;
      const isTreeEdge = neighbor.parentId === atom.id || atom.parentId === bond.to;
      if (isTreeEdge) continue;

      const ring = treePathBetween(graph, atom.id, bond.to);
      let anchorIndex = 0;
      let anchorDepth = Infinity;
      ring.forEach((id, i) => {
        const depth = pathToRoot(graph, id).length;
        if (depth < anchorDepth) {
          anchorDepth = depth;
          anchorIndex = i;
        }
      });
      return [...ring.slice(anchorIndex), ...ring.slice(0, anchorIndex)];
    }
  }
  return null; // unreachable: hasRing() true guarantees a non-tree edge exists
}

/** The ring's bonds as the same sorted `a-b` keys `collectBonds` renders with — which bonds get the aromatic circle's effective-single-order treatment. */
export function ringBondKeys(ring: string[]): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    keys.add([a, b].sort((x, y) => Number(x) - Number(y)).join("-"));
  }
  return keys;
}

/**
 * Whether the ring should render with the modern inscribed-circle notation:
 * a 6-membered all-carbon ring whose bonds alternate single/double all the
 * way around (either Kekule resonance form). Purely a display test on
 * whatever bond orders are currently stored — so hand-editing a
 * cyclohexa-1,3,5-triene into full alternation flips this true, and
 * dropping any one bond back to single flips it false again.
 */
export function isAromaticRing(graph: MoleculeGraph, ring: string[]): boolean {
  if (ring.length !== 6) return false;
  if (!ring.every((id) => findAtomById(graph, id)?.element === "C")) return false;

  const orders = ring.map((id, i) => bondOrderBetween(graph, id, ring[(i + 1) % ring.length]));
  if (orders.some((order) => order === undefined)) return false;

  const alternates = (first: BondOrder) => orders.every((order, i) => order === (i % 2 === 0 ? first : 3 - first));
  return alternates(2) || alternates(1);
}

/** Whether the toolbar's ring insertion is legal through `anchorId`: no existing ring, a carbon anchor with enough open valency (3 for aromatic, 2 otherwise). */
export function canInsertRing(graph: MoleculeGraph, anchorId: string, aromatic: boolean): boolean {
  if (hasRing(graph)) return false;
  const anchor = findAtomById(graph, anchorId);
  if (!anchor || anchor.element !== "C") return false;
  return openSlotCount(anchor) >= (aromatic ? 3 : 2);
}
