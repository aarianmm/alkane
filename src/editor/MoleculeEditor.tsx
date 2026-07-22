import type { BondOrder, MoleculeGraph } from "../graph/types";
import { openSlotCount } from "../graph/queries";
import { angularDistance } from "../layout/hydrogens";
import {
  computeAngleIns,
  computeGrowthTargets,
  computeHydrogenPlacements,
  layoutFromRoot,
  type Point,
} from "../layout/geometry";
import { computeViewBox } from "../layout/viewBox";
import type { RenderStyle, LabelSpec } from "../styles/types";
import type { Selection } from "../state/editorReducer";
import { AtomView } from "./Atom";
import { BondView } from "./Bond";
import { HydrogenView } from "./Hydrogen";
import { StubView } from "./Stub";

interface MoleculeEditorProps {
  graph: MoleculeGraph;
  style: RenderStyle;
  selection: Selection;
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
  onStubActivate,
  onAtomActivate,
  onBondActivate,
  onCanvasActivate,
}: MoleculeEditorProps) {
  const positions = layoutFromRoot(graph, style);
  const angleIns = computeAngleIns(graph, style);
  const labels = new Map(
    graph.atoms.map((atom) => [
      atom.id,
      style.label(atom, { hydrogenCount: openSlotCount(atom), angleIn: angleIns.get(atom.id) ?? null }),
    ]),
  );

  const bonds = collectBonds(graph, positions, labels);
  const growthTargets = computeGrowthTargets(graph, style);
  const hydrogens = computeHydrogenPlacements(graph, style);

  const showStubs = !style.rendersExplicitHydrogens;
  const stubs = showStubs ? growthTargets : [];

  const viewBox = computeViewBox([
    ...positions.values(),
    ...growthTargets.map((t) => t.position),
    ...hydrogens.map((h) => h.position),
  ]);

  return (
    <svg
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      role="img"
      aria-label="Molecule editor canvas"
      style={{ width: "100%", height: "100%" }}
      onPointerDown={onCanvasActivate}
    >
      {bonds.map((bond) => (
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
          onActivate={onAtomActivate}
        />
      ))}
    </svg>
  );
}
