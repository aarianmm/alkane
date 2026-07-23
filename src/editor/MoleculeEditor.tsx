import { useState } from "react";
import type { BondOrder, Element, MoleculeGraph } from "../graph/types";
import { findRing, isAromaticRing, openSlotCount, ringBondKeys } from "../graph/queries";
import { addAtomFromStub, setAtomElement } from "../graph/mutations";
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
import { GhostLayer } from "./GhostLayer";
import { HydrogenView } from "./Hydrogen";
import { StubView } from "./Stub";

interface MoleculeEditorProps {
  graph: MoleculeGraph;
  style: RenderStyle;
  selection: Selection;
  /** The element/bond-order the next stub click would place — needed to compute the stub-hover preview below. */
  tool: { element: Element; bondOrder: BondOrder };
  /**
   * An externally-computed candidate graph to preview, for pending edits that
   * don't originate from a hovered stub (e.g. a later feature hovering a
   * toolbar element/bond-order swatch while an atom/bond is selected). Pass
   * null/undefined when there's nothing pending. Ignored while a stub/hydrogen
   * is itself hovered, since that hover always wins — see GhostLayer's
   * contract for how to build one of these.
   */
  previewGraph?: MoleculeGraph | null;
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
  tool,
  previewGraph: externalPreviewGraph,
  onStubActivate,
  onAtomActivate,
  onBondActivate,
  onCanvasActivate,
}: MoleculeEditorProps) {
  // Which stub/hydrogen (by the atom id it would grow from) is currently
  // hovered, if any — the local UI state a hover preview is derived from.
  // Guarded against out-of-order enter/leave events across two different
  // stubs: a leave only clears the state if it's still the one that set it.
  const [hoveredStubAtomId, setHoveredStubAtomId] = useState<string | null>(null);
  function handleStubHover(atomId: string, hovering: boolean) {
    setHoveredStubAtomId((current) => {
      if (hovering) return atomId;
      return current === atomId ? null : current;
    });
  }

  // Which existing graph atom (as opposed to a stub) is hovered, if any --
  // drives the click-to-replace hover preview below. Same guarded
  // enter/leave shape as the stub hover state above.
  const [hoveredAtomId, setHoveredAtomId] = useState<string | null>(null);
  function handleAtomHover(atomId: string, hovering: boolean) {
    setHoveredAtomId((current) => {
      if (hovering) return atomId;
      return current === atomId ? null : current;
    });
  }

  // The candidate graph a stub hover previews: exactly the transform its
  // click would perform. Falls back to whatever preview a caller passed in
  // (e.g. a later feature's own hovered pending edit) when no stub is
  // hovered; a stub hover always takes priority since it's the more specific,
  // more immediate signal.
  let stubPreviewGraph: MoleculeGraph | null = null;
  if (hoveredStubAtomId !== null) {
    try {
      stubPreviewGraph = addAtomFromStub(graph, hoveredStubAtomId, tool.element, tool.bondOrder);
    } catch {
      stubPreviewGraph = null;
    }
  }

  // The candidate graph a hovered *existing* atom previews: just that one
  // atom retyped to the armed element -- deliberately un-pruned, so the
  // preview only ever shows the single changed atom, never the branches a
  // real click-to-replace might go on to trim (see retypeAtomWithPrune).
  // A pending ring is a "massive" change (a whole ring replacing one atom),
  // so it's deliberately never previewed -- no candidate graph at all.
  let atomHoverPreviewGraph: MoleculeGraph | null = null;
  if (hoveredAtomId !== null && selection?.kind !== "pendingRing") {
    try {
      atomHoverPreviewGraph = setAtomElement(graph, hoveredAtomId, tool.element);
    } catch {
      atomHoverPreviewGraph = null;
    }
  }

  const previewGraph = stubPreviewGraph ?? atomHoverPreviewGraph ?? externalPreviewGraph ?? null;

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
      <GhostLayer
        baseGraph={graph}
        basePositions={positions}
        baseLabels={labels}
        previewGraph={previewGraph}
        style={style}
      />
      {renderedBonds.map((bond) => (
        <BondView
          key={bond.key}
          from={bond.from}
          to={bond.to}
          order={bond.order}
          fromLabel={bond.fromLabel}
          toLabel={bond.toLabel}
          isSelected={isSelectedBond(selection, bond.atomIdA, bond.atomIdB)}
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
            onHoverChange={(hovering) => handleStubHover(hydrogen.atomId, hovering)}
          />
        );
      })}
      {stubs.map((stub) => (
        <StubView
          key={`${stub.atomId}-${stub.slot}`}
          stub={stub}
          onActivate={onStubActivate}
          onHoverChange={(hovering) => handleStubHover(stub.atomId, hovering)}
        />
      ))}
      {graph.atoms.map((atom) => (
        <AtomView
          key={atom.id}
          atom={atom}
          position={positions.get(atom.id)!}
          label={labels.get(atom.id) ?? null}
          isSelected={isSelectedAtom(selection, atom.id)}
          onActivate={onAtomActivate}
          onHoverChange={(hovering) => handleAtomHover(atom.id, hovering)}
        />
      ))}
    </svg>
  );
}
