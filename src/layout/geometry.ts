import { PERIODIC_TABLE, type Atom, type MoleculeGraph } from "../graph/types";

/** SVG user units. The whole editor scales via viewBox, not raw pixels. */
export const BOND_LENGTH = 42;

/** The root has no parent bond; its first bond points straight up. */
const ROOT_VIRTUAL_ANGLE_BACK = -90;

export interface Point {
  x: number;
  y: number;
}

export function pointAt(origin: Point, angleDegrees: number, distance: number): Point {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: origin.x + distance * Math.cos(radians),
    y: origin.y + distance * Math.sin(radians),
  };
}

/** The direction pointing back toward an atom's parent — undefined only for the root. */
export function angleBackToParent(angleFromParent: number | undefined): number {
  return angleFromParent === undefined ? ROOT_VIRTUAL_ANGLE_BACK : angleFromParent + 180;
}

function childrenByParent(graph: MoleculeGraph): Map<string, Atom[]> {
  const map = new Map<string, Atom[]>();
  for (const atom of graph.atoms) {
    if (atom.parentId === undefined) continue;
    const siblings = map.get(atom.parentId) ?? [];
    siblings.push(atom);
    map.set(atom.parentId, siblings);
  }
  return map;
}

/**
 * Positions every atom from the graph's stored angleFromParent, walking out
 * from the root. Pure function of the graph — incremental by construction,
 * since an atom's position only depends on its ancestors' angles, never on
 * its siblings. This only follows parent->child edges; a later ring-closing
 * bond doesn't move anything (see layoutRingPolygon, added when ring closure
 * is wired up).
 */
export function layoutFromRoot(graph: MoleculeGraph): Map<string, Point> {
  const positions = new Map<string, Point>();
  const children = childrenByParent(graph);

  positions.set(graph.rootId, { x: 0, y: 0 });
  const queue = [graph.rootId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentPos = positions.get(currentId)!;

    for (const child of children.get(currentId) ?? []) {
      positions.set(child.id, pointAt(currentPos, child.angleFromParent!, BOND_LENGTH));
      queue.push(child.id);
    }
  }

  return positions;
}

/**
 * The fixed set of candidate bond directions for an atom, evenly spread
 * 360°/valency apart — the 2D projection of its bond positions, one of
 * which (for a non-root atom) is already taken by the parent bond. This is
 * computed from the atom's total valency, not from how many bonds it
 * currently has, so it stays stable as the atom grows: each new bond lands
 * on the next fixed position in the sequence, never shifting the ones
 * already placed. (Retyping an atom to a lower-valency element after it
 * already has more children than the new element allows is a rare,
 * self-inflicted edge case left to the backend's validation rather than
 * handled here.)
 */
export function stubCandidateAngles(graph: MoleculeGraph, atomId: string): number[] {
  const atom = graph.atoms.find((a) => a.id === atomId);
  if (!atom) return [];

  const isRoot = atomId === graph.rootId;
  const valency = PERIODIC_TABLE[atom.element].valency;
  const step = 360 / valency;

  if (isRoot) {
    return Array.from({ length: valency }, (_, k) => ROOT_VIRTUAL_ANGLE_BACK + k * step);
  }

  // k=0 is the parent's own position; the remaining valency-1 positions
  // continue evenly around the circle from there.
  const angleBack = angleBackToParent(atom.angleFromParent);
  return Array.from({ length: valency - 1 }, (_, i) => angleBack + (i + 1) * step);
}

export interface Stub {
  atomId: string;
  angle: number;
  position: Point;
}

/**
 * The single next open stub for each atom that has one — not every open
 * slot at once. Showing every candidate simultaneously gets cluttered fast
 * on a bigger molecule; instead each atom reveals one growth point at a
 * time, in the atom's fixed candidate order, and the next one appears once
 * that slot is filled.
 */
export function computeOpenStubs(graph: MoleculeGraph, positions: Map<string, Point>): Stub[] {
  const children = childrenByParent(graph);
  const stubs: Stub[] = [];

  for (const atom of graph.atoms) {
    const usedAngles = new Set((children.get(atom.id) ?? []).map((c) => c.angleFromParent!));
    const position = positions.get(atom.id)!;

    const nextAngle = stubCandidateAngles(graph, atom.id).find((angle) => !usedAngles.has(angle));
    if (nextAngle === undefined) continue;

    stubs.push({ atomId: atom.id, angle: nextAngle, position: pointAt(position, nextAngle, BOND_LENGTH) });
  }

  return stubs;
}
