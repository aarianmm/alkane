import type { BondOrder, MoleculeGraph } from "./types";

/** Canonical bond key: two atom ids joined low-to-high numerically — the same convention MoleculeEditor's collectBonds renders with. */
function bondKey(atomIdA: string, atomIdB: string): string {
  return [atomIdA, atomIdB].sort((a, b) => Number(a) - Number(b)).join("-");
}

function bondOrdersByKey(graph: MoleculeGraph): Map<string, BondOrder> {
  const map = new Map<string, BondOrder>();
  for (const atom of graph.atoms) {
    for (const bond of atom.bonds) {
      map.set(bondKey(atom.id, bond.to), bond.order);
    }
  }
  return map;
}

export interface GhostBond {
  key: string;
  atomIdA: string;
  atomIdB: string;
  order: BondOrder;
}

export interface GraphDiff {
  /** Atom ids present in `preview` but not `base` — e.g. the atom a stub-hover would grow. */
  addedAtomIds: Set<string>;
  /** Atom ids present in both graphs whose element differs — e.g. a hovered atom-retype. Never overlaps addedAtomIds. */
  changedAtomIds: Set<string>;
  /** Bonds (by canonical key) that are new in `preview`, or already existed but at a different order — e.g. a hovered bond-order change. */
  changedBonds: GhostBond[];
}

/**
 * The reusable "hover preview" seam: diffs a candidate (preview) graph
 * against the real (base) graph and reports only what's new or different —
 * never a full graph walk the caller has to re-derive meaning from. Any
 * feature that previews a pending edit (grow an atom from a stub, retype a
 * selected atom, change a bond's order, ...) can build its candidate graph
 * with the existing pure `graph/mutations` transforms, hand both graphs to
 * `diffGraphs`, and render the result translucently — see
 * `src/editor/GhostLayer.tsx` for the rendering half of this contract.
 *
 * Deliberately shallow: it reports added atoms, atoms whose element changed,
 * and bonds that are new or reordered. It does NOT attempt to diff whole
 * subtrees or renumber/match atoms across unrelated ids — by design, per the
 * product scope, a preview only ever represents a single small pending
 * change. A caller whose candidate graph would produce a "massive" diff (e.g.
 * swapping an atom for a whole ring) should simply not compute or pass a
 * preview graph at all; `GhostLayer` already renders nothing for a
 * null/undefined preview.
 */
export function diffGraphs(base: MoleculeGraph, preview: MoleculeGraph): GraphDiff {
  const baseAtomsById = new Map(base.atoms.map((a) => [a.id, a]));

  const addedAtomIds = new Set<string>();
  const changedAtomIds = new Set<string>();
  for (const atom of preview.atoms) {
    const baseAtom = baseAtomsById.get(atom.id);
    if (!baseAtom) {
      addedAtomIds.add(atom.id);
    } else if (baseAtom.element !== atom.element) {
      changedAtomIds.add(atom.id);
    }
  }

  const baseBondOrders = bondOrdersByKey(base);
  const changedBonds: GhostBond[] = [];
  for (const [key, order] of bondOrdersByKey(preview)) {
    if (baseBondOrders.get(key) !== order) {
      const [atomIdA, atomIdB] = key.split("-");
      changedBonds.push({ key, atomIdA, atomIdB, order });
    }
  }

  return { addedAtomIds, changedAtomIds, changedBonds };
}
