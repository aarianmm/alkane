import type { BondOrder, Element, MoleculeGraph } from "../graph/types";
import { findRing, isAromaticRing, openSlotCount, ringBondKeys } from "../graph/queries";
import { angularDistance } from "../layout/hydrogens";
import {
  computeAngleIns,
  computeBondAngles,
  computeGrowthTargets,
  computeHydrogenPlacements,
  layoutFromRoot,
  pointAt,
  type Point,
} from "../layout/geometry";
import { computeViewBox } from "../layout/viewBox";
import type { RenderStyle, LabelSpec } from "../styles/types";
import type { Selection } from "../state/editorReducer";
import { AtomView } from "./Atom";
import { BondView, DEFAULT_STROKE, DEFAULT_STROKE_WIDTH } from "./Bond";
import { HydrogenView } from "./Hydrogen";
import { StubView } from "./Stub";

interface MoleculeEditorProps {
  graph: MoleculeGraph;
  style: RenderStyle;
  selection: Selection;
  /** While on, hovering an atom/bond previews red (about to be deleted/trimmed) instead of the normal selection blue. */
  deleteMode: boolean;
  /** The element the next atom click will apply -- also used to tell whether hovering a given atom would actually change it. */
  armedElement: Element;
  onStubActivate: (atomId: string) => void;
  onAtomActivate: (atomId: string) => void;
  onBondActivate: (atomIdA: string, atomIdB: string) => void;
  onCanvasActivate: () => void;
}

interface RenderedBond {
  key: string;
  atomIdA: string;
  atomIdB: string;
  from: Point;
  to: Point;
  order: BondOrder;
  fromLabel: LabelSpec | null;
  toLabel: LabelSpec | null;
}

function collectBonds(
  graph: MoleculeGraph,
  positions: Map<string, Point>,
  labels: Map<string, LabelSpec | null>,
): RenderedBond[] {
  const bonds: RenderedBond[] = [];
  const seen = new Set<string>();

  for (const atom of graph.atoms) {
    for (const bond of atom.bonds) {
      // Bonds are stored symmetrically on both atoms; render each pair once.
      const key = [atom.id, bond.to].sort((a, b) => Number(a) - Number(b)).join("-");
      if (seen.has(key)) continue;
      seen.add(key);

      bonds.push({
        key,
        atomIdA: atom.id,
        atomIdB: bond.to,
        from: positions.get(atom.id)!,
        to: positions.get(bond.to)!,
        order: bond.order,
        fromLabel: labels.get(atom.id) ?? null,
        toLabel: labels.get(bond.to) ?? null,
      });
    }
  }

  return bonds;
}

/** How far past the growable hydrogen its always-visible stub dot sits, in the direction growth would continue. */
const GROWTH_STUB_OFFSET = 14;

/** Fraction of the ring's circumradius the aromatic circle is drawn at — visually inset from the vertices/bonds. */
const AROMATIC_CIRCLE_SCALE = 0.6;

function centroid(points: Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function isSelectedAtom(selection: Selection, atomId: string): boolean {
  return selection?.kind === "atom" && selection.atomId === atomId;
}

function isSelectedBond(selection: Selection, atomIdA: string, atomIdB: string): boolean {
  return (
    selection?.kind === "bond" &&
    ((selection.atomIdA === atomIdA && selection.atomIdB === atomIdB) ||
      (selection.atomIdA === atomIdB && selection.atomIdB === atomIdA))
  );
}

// A pending ring always changes something concrete when it lands (there's no
// single "already this" element to compare against), so only a plain armed
// element -- already equal to the atom's own -- counts as a no-op.
function isReplaceableAtom(selection: Selection, armedElement: Element, atomElement: Element): boolean {
  return selection?.kind === "pendingRing" || atomElement !== armedElement;
}

/**
 * Renders the molecule graph as SVG and turns pointer activity into editing
 * requests (grow from a stub, select an atom/bond, deselect on empty canvas).
 * This component only draws the graph — it must never be the source of
 * chemical meaning (see Alkane-Implementation-Plan.md). All angle and label
 * decisions come from `style` (see src/styles) so the same graph renders
 * differently under Displayed/Structural/Skeletal without this component
 * knowing which one is active.
 */
export function MoleculeEditor({
  graph,
  style,
  selection,
  deleteMode,
  armedElement,
  onStubActivate,
  onAtomActivate,
  onBondActivate,
  onCanvasActivate,
}: MoleculeEditorProps) {
  const positions = layoutFromRoot(graph, style);
  const angleIns = computeAngleIns(graph, style);
  const bondAngles = computeBondAngles(graph, style);
  const labels = new Map(
    graph.atoms.map((atom) => [
      atom.id,
      style.label(atom, {
        hydrogenCount: openSlotCount(atom),
        angleIn: angleIns.get(atom.id) ?? null,
        bondAngles: bondAngles.get(atom.id) ?? [],
      }),
    ]),
  );

  const bonds = collectBonds(graph, positions, labels);
  const growthTargets = computeGrowthTargets(graph, style);
  const hydrogens = computeHydrogenPlacements(graph, style);

  // Benzene renders with the modern inscribed circle, never its stored
  // Kekule lines — a pure display choice derived fresh every render, so
  // hand-alternating a ring's bonds into a full 1/2 cycle flips this on
  // automatically, and dropping any one bond back to single flips it off
  // again.
  const ring = findRing(graph);
  const aromatic = ring !== null && isAromaticRing(graph, ring);
  const aromaticKeys = aromatic ? ringBondKeys(ring!) : null;
  const renderedBonds = aromaticKeys
    ? bonds.map((bond) => (aromaticKeys.has(bond.key) ? { ...bond, order: 1 as BondOrder } : bond))
    : bonds;
  const aromaticCircle = aromatic
    ? (() => {
        const vertices = ring!.map((id) => positions.get(id)!);
        const center = centroid(vertices);
        const radius = Math.hypot(vertices[0].x - center.x, vertices[0].y - center.y) * AROMATIC_CIRCLE_SCALE;
        return { center, radius };
      })()
    : null;

  const showStubs = !style.rendersExplicitHydrogens;
  const stubs = showStubs ? growthTargets : [];

  const growthStubPositions = new Map(
    growthTargets.map((t) => [t.atomId, pointAt(t.position, t.angle, GROWTH_STUB_OFFSET)]),
  );

  const viewBox = computeViewBox([
    ...positions.values(),
    ...growthTargets.map((t) => t.position),
    ...hydrogens.map((h) => h.position),
    ...growthStubPositions.values(),
  ]);

  return (
    <svg
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      role="img"
      aria-label="Molecule editor canvas"
      style={{ width: "100%", height: "100%" }}
      onPointerDown={onCanvasActivate}
    >
      {renderedBonds.map((bond) => (
        <BondView
          key={bond.key}
          from={bond.from}
          to={bond.to}
          order={bond.order}
          fromLabel={bond.fromLabel}
          toLabel={bond.toLabel}
          isSelected={isSelectedBond(selection, bond.atomIdA, bond.atomIdB)}
          deleteMode={deleteMode}
          interactive
          onActivate={() => onBondActivate(bond.atomIdA, bond.atomIdB)}
        />
      ))}
      {aromaticCircle && (
        <circle
          cx={aromaticCircle.center.x}
          cy={aromaticCircle.center.y}
          r={aromaticCircle.radius}
          fill="none"
          stroke={DEFAULT_STROKE}
          strokeWidth={DEFAULT_STROKE_WIDTH}
        />
      )}
      {hydrogens.map((hydrogen) => (
        <BondView
          key={`h-bond-${hydrogen.atomId}-${hydrogen.angle}`}
          from={positions.get(hydrogen.atomId)!}
          to={hydrogen.position}
          order={1}
          fromLabel={labels.get(hydrogen.atomId) ?? null}
          toLabel={{ main: "H", hydrogenCount: 0, hydrogenSide: "after" }}
          isSelected={false}
          deleteMode={false}
          interactive={false}
          onActivate={() => {}}
        />
      ))}
      {hydrogens.map((hydrogen) => {
        const target = growthTargets.find(
          (t) => t.atomId === hydrogen.atomId && angularDistance(t.angle, hydrogen.angle) < 1e-6,
        );
        return (
          <HydrogenView
            key={`h-${hydrogen.atomId}-${hydrogen.angle}`}
            position={hydrogen.position}
            isGrowthTarget={target !== undefined}
            stubPosition={target ? growthStubPositions.get(hydrogen.atomId) : undefined}
            onActivate={() => onStubActivate(hydrogen.atomId)}
          />
        );
      })}
      {stubs.map((stub) => (
        <StubView key={`${stub.atomId}-${stub.slot}`} stub={stub} onActivate={onStubActivate} />
      ))}
      {graph.atoms.map((atom) => (
        <AtomView
          key={atom.id}
          atom={atom}
          position={positions.get(atom.id)!}
          label={labels.get(atom.id) ?? null}
          isSelected={isSelectedAtom(selection, atom.id)}
          deleteMode={deleteMode}
          deletable={atom.id !== graph.rootId}
          replaceable={isReplaceableAtom(selection, armedElement, atom.element)}
          onActivate={onAtomActivate}
        />
      ))}
    </svg>
  );
}
