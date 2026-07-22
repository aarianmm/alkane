import type { BondOrder, MoleculeGraph } from "../graph/types";
import type { Selection } from "../state/editorReducer";
import { computeOpenStubs, layoutFromRoot, type Point } from "../layout/geometry";
import { computeViewBox } from "../layout/viewBox";
import { AtomView } from "./Atom";
import { BondView } from "./Bond";
import { showsAtomLabel } from "./labels";
import { StubView } from "./Stub";

interface MoleculeEditorProps {
  graph: MoleculeGraph;
  selection: Selection;
  onStubActivate: (atomId: string, angle: number) => void;
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
  showFromLabel: boolean;
  showToLabel: boolean;
}

function collectBonds(graph: MoleculeGraph, positions: Map<string, Point>): RenderedBond[] {
  const byId = new Map(graph.atoms.map((a) => [a.id, a]));
  const bonds: RenderedBond[] = [];
  const seen = new Set<string>();

  for (const atom of graph.atoms) {
    for (const bond of atom.bonds) {
      // Bonds are stored symmetrically on both atoms; render each pair once.
      const key = [atom.id, bond.to].sort((a, b) => Number(a) - Number(b)).join("-");
      if (seen.has(key)) continue;
      seen.add(key);

      const other = byId.get(bond.to)!;
      bonds.push({
        key,
        atomIdA: atom.id,
        atomIdB: bond.to,
        from: positions.get(atom.id)!,
        to: positions.get(bond.to)!,
        order: bond.order,
        showFromLabel: showsAtomLabel(atom),
        showToLabel: showsAtomLabel(other),
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
 * chemical meaning (see Alkane-Implementation-Plan.md).
 */
export function MoleculeEditor({
  graph,
  selection,
  onStubActivate,
  onAtomActivate,
  onBondActivate,
  onCanvasActivate,
}: MoleculeEditorProps) {
  const positions = layoutFromRoot(graph);
  const bonds = collectBonds(graph, positions);
  const stubs = computeOpenStubs(graph, positions);
  const viewBox = computeViewBox([...positions.values(), ...stubs.map((s) => s.position)]);

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
          showFromLabel={bond.showFromLabel}
          showToLabel={bond.showToLabel}
          isSelected={isSelectedBond(selection, bond.atomIdA, bond.atomIdB)}
          onActivate={() => onBondActivate(bond.atomIdA, bond.atomIdB)}
        />
      ))}
      {stubs.map((stub) => (
        <StubView key={`${stub.atomId}-${stub.angle}`} stub={stub} onActivate={onStubActivate} />
      ))}
      {graph.atoms.map((atom) => (
        <AtomView
          key={atom.id}
          atom={atom}
          position={positions.get(atom.id)!}
          isSelected={isSelectedAtom(selection, atom.id)}
          onActivate={onAtomActivate}
        />
      ))}
    </svg>
  );
}
