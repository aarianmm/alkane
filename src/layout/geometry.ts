import { PERIODIC_TABLE, type Atom, type MoleculeGraph } from "../graph/types";
import { openSlotCount } from "../graph/queries";
import type { RenderStyle } from "../styles/types";
import { angularDistance, placeHydrogens } from "./hydrogens";

/** SVG user units. The whole editor scales via viewBox, not raw pixels. */
export const BOND_LENGTH = 42;

/** Hydrogens render at a shorter bond than heavy atoms, per the geometry design doc (Displayed only). */
export const HYDROGEN_BOND_LENGTH = BOND_LENGTH * 0.8;

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

interface AtomGeometry {
  position: Point;
  /** Direction from this atom's parent to this atom. Null only at the root. */
  angleIn: number | null;
  /** This atom's parent's own angleIn — needed only by skeletal's turn alternation. */
  grandAngleIn: number | null;
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

/** The lowest slot ordinal not already occupied by one of parentId's children, per atom. */
function usedSlotsByParent(graph: MoleculeGraph): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const atom of graph.atoms) {
    if (atom.parentId === undefined) continue;
    const slots = map.get(atom.parentId) ?? new Set<number>();
    slots.add(atom.slotFromParent!);
    map.set(atom.parentId, slots);
  }
  return map;
}

/**
 * Positions every atom by walking out from the root and asking the style
 * for each child's angle. Pure function of the graph and style — incremental
 * by construction, since an atom's position depends only on its ancestors
 * and its own stored slot, never on its siblings. This only follows
 * parent->child edges; a later ring-closing bond doesn't move anything (see
 * layoutRingPolygon, added when ring closure is wired up).
 */
function computeAtomGeometry(graph: MoleculeGraph, style: RenderStyle): Map<string, AtomGeometry> {
  const geometry = new Map<string, AtomGeometry>();
  const children = childrenByParent(graph);
  const byId = new Map(graph.atoms.map((a) => [a.id, a]));

  geometry.set(graph.rootId, { position: { x: 0, y: 0 }, angleIn: null, grandAngleIn: null });
  const queue = [graph.rootId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = geometry.get(currentId)!;
    const valency = PERIODIC_TABLE[byId.get(currentId)!.element].valency;

    for (const child of children.get(currentId) ?? []) {
      const angle = style.childAngle({
        angleIn: current.angleIn,
        grandAngleIn: current.grandAngleIn,
        slot: child.slotFromParent!,
        valency,
      });
      geometry.set(child.id, {
        position: pointAt(current.position, angle, BOND_LENGTH),
        angleIn: angle,
        grandAngleIn: current.angleIn,
      });
      queue.push(child.id);
    }
  }

  return geometry;
}

export function layoutFromRoot(graph: MoleculeGraph, style: RenderStyle): Map<string, Point> {
  const geometry = computeAtomGeometry(graph, style);
  const positions = new Map<string, Point>();
  for (const [id, g] of geometry) positions.set(id, g.position);
  return positions;
}

/** Per atom, the direction from its parent to it — null only at the root. Label rules that vary by bond direction (e.g. Structural's H3C- vs -CH3) need this. */
export function computeAngleIns(graph: MoleculeGraph, style: RenderStyle): Map<string, number | null> {
  const geometry = computeAtomGeometry(graph, style);
  const angleIns = new Map<string, number | null>();
  for (const [id, g] of geometry) angleIns.set(id, g.angleIn);
  return angleIns;
}

/**
 * Per atom, the direction (degrees) of every tree bond leaving it — the
 * parent bond plus each child bond. Label rules that depend on where bonds
 * exit (Structural and Skeletal's H3C- vs -CH3 side rule) consume this. Ring-
 * closing bonds excluded until the ring stage.
 */
export function computeBondAngles(graph: MoleculeGraph, style: RenderStyle): Map<string, number[]> {
  const geometry = computeAtomGeometry(graph, style);
  const map = new Map<string, number[]>();
  for (const atom of graph.atoms) map.set(atom.id, heavyBondAngles(graph, atom.id, geometry));
  return map;
}

export interface SlotCandidate {
  slot: number;
  angle: number;
}

/**
 * The fixed set of candidate attachment directions for an atom under a
 * given style — one entry per unfilled or filled slot the atom's valency
 * allows (1..valency at the root, 1..valency-1 elsewhere, since a non-root
 * atom's slot 0 is always the parent bond). Computed from total valency, not
 * from how many bonds the atom currently has, so it stays stable as the atom
 * grows: each new bond lands on the next fixed slot, never shifting ones
 * already placed.
 */
function candidateSlotAngles(
  graph: MoleculeGraph,
  style: RenderStyle,
  atomId: string,
  geometry: Map<string, AtomGeometry>,
): SlotCandidate[] {
  const atom = graph.atoms.find((a) => a.id === atomId)!;
  const g = geometry.get(atomId)!;
  const valency = PERIODIC_TABLE[atom.element].valency;
  const isRoot = atomId === graph.rootId;
  const slotCount = Math.max(0, isRoot ? valency : valency - 1);

  return Array.from({ length: slotCount }, (_, i) => {
    const slot = i + 1;
    return { slot, angle: style.childAngle({ angleIn: g.angleIn, grandAngleIn: g.grandAngleIn, slot, valency }) };
  });
}

/**
 * The angles of every real bond (parent and children alike) an atom already
 * has, reconstructed from stored `angleIn`s rather than positions — the
 * parent bond is the reverse of this atom's own angleIn, and each child
 * contributes its own angleIn (the angle from this atom to it).
 */
function heavyBondAngles(
  graph: MoleculeGraph,
  atomId: string,
  geometry: Map<string, AtomGeometry>,
): number[] {
  const byId = new Map(graph.atoms.map((a) => [a.id, a]));
  const atom = byId.get(atomId)!;
  const g = geometry.get(atomId)!;
  const angles: number[] = [];

  if (g.angleIn !== null) angles.push(g.angleIn + 180);
  for (const bond of atom.bonds) {
    const neighbor = byId.get(bond.to)!;
    if (neighbor.parentId === atomId) angles.push(geometry.get(bond.to)!.angleIn!);
  }

  return angles;
}

/** Per-atom: which free slot angles get an implicit hydrogen, per the spread heuristic in hydrogens.ts. */
function hydrogenAnglesForAtom(
  graph: MoleculeGraph,
  style: RenderStyle,
  atomId: string,
  geometry: Map<string, AtomGeometry>,
): number[] {
  const atom = graph.atoms.find((a) => a.id === atomId)!;
  const used = usedSlotsByParent(graph).get(atomId) ?? new Set<number>();
  const freeAngles = candidateSlotAngles(graph, style, atomId, geometry)
    .filter((c) => !used.has(c.slot))
    .map((c) => c.angle);

  return placeHydrogens(freeAngles, openSlotCount(atom), heavyBondAngles(graph, atomId, geometry));
}

export interface HydrogenPlacement {
  atomId: string;
  angle: number;
  position: Point;
}

/** Positions of every implicit-hydrogen pseudo-atom, for styles that draw them explicitly (Displayed only). */
export function computeHydrogenPlacements(graph: MoleculeGraph, style: RenderStyle): HydrogenPlacement[] {
  if (!style.rendersExplicitHydrogens) return [];

  const geometry = computeAtomGeometry(graph, style);
  const placements: HydrogenPlacement[] = [];

  for (const atom of graph.atoms) {
    const position = geometry.get(atom.id)!.position;
    for (const angle of hydrogenAnglesForAtom(graph, style, atom.id, geometry)) {
      placements.push({ atomId: atom.id, angle, position: pointAt(position, angle, HYDROGEN_BOND_LENGTH) });
    }
  }

  return placements;
}

export interface GrowthTarget {
  atomId: string;
  slot: number;
  angle: number;
  position: Point;
}

/**
 * The single next growth point for each atom that has one — not every open
 * slot at once, so the canvas doesn't get cluttered as the molecule grows.
 * For a style that draws explicit hydrogens, growth only makes sense at a
 * slot that currently has a hydrogen rendered on it (that's the thing being
 * clicked and substituted); for other styles, it's simply the lowest unused
 * slot.
 */
export function computeGrowthTargets(graph: MoleculeGraph, style: RenderStyle): GrowthTarget[] {
  const geometry = computeAtomGeometry(graph, style);
  const usedSlots = usedSlotsByParent(graph);
  const targets: GrowthTarget[] = [];

  for (const atom of graph.atoms) {
    if (openSlotCount(atom) === 0) continue; // valency exhausted — nothing can grow here in any style

    const used = usedSlots.get(atom.id) ?? new Set<number>();
    const candidates = candidateSlotAngles(graph, style, atom.id, geometry).filter((c) => !used.has(c.slot));
    if (candidates.length === 0) continue;

    let chosen = candidates[0];
    if (style.rendersExplicitHydrogens) {
      const hydrogenAngles = hydrogenAnglesForAtom(graph, style, atom.id, geometry);
      const withHydrogen = candidates.filter((c) =>
        hydrogenAngles.some((a) => angularDistance(a, c.angle) < 1e-6),
      );
      if (withHydrogen.length === 0) continue; // no hydrogen to substitute here (e.g. valency already exhausted)
      chosen = withHydrogen[0];
    }

    targets.push({
      atomId: atom.id,
      slot: chosen.slot,
      angle: chosen.angle,
      position: pointAt(geometry.get(atom.id)!.position, chosen.angle, BOND_LENGTH),
    });
  }

  return targets;
}
