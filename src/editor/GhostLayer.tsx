import { openSlotCount } from "../graph/queries";
import type { MoleculeGraph } from "../graph/types";
import { diffGraphs } from "../graph/preview";
import { computeAngleIns, computeBondAngles, layoutFromRoot, type Point } from "../layout/geometry";
import type { LabelSpec, RenderStyle } from "../styles/types";
import { AtomView } from "./Atom";
import { BondView } from "./Bond";

/** Opacity the ghost renders at — faint enough to read as "not yet real", per the hover-preview spec. */
const GHOST_OPACITY = 0.35;

interface GhostLayerProps {
  /** The real, committed graph — what's actually drawn everywhere else in the editor. */
  baseGraph: MoleculeGraph;
  /** Positions already computed for `baseGraph` at the active style, so unchanged atoms/bonds render pixel-identical to their real counterparts instead of being recomputed. */
  basePositions: Map<string, Point>;
  /** Labels already computed for `baseGraph` at the active style, for the same reason. */
  baseLabels: Map<string, LabelSpec | null>;
  /**
   * The candidate graph as it would look *after* whatever's currently
   * hovered/pending is committed — or null/undefined to render nothing. This
   * is the seam later features reuse: build a candidate with the existing
   * `graph/mutations` transforms (addAtomFromStub, setAtomElement,
   * setBondOrder, ...) from local hover state, and pass it here. A feature
   * whose candidate would be a "massive" diff (e.g. swapping an atom for a
   * whole ring) should simply pass null instead — this component already
   * tolerates that.
   */
  previewGraph: MoleculeGraph | null | undefined;
  style: RenderStyle;
}

/**
 * Renders the translucent "ghost" pre-image of a pending, not-yet-committed
 * edit: whatever `diffGraphs` says is new or different between `baseGraph`
 * and `previewGraph`, drawn with the exact same `AtomView`/`BondView` used for
 * real atoms/bonds so it reads as a faded version of the real thing, not a
 * bespoke shape. Nothing here is interactive — the whole layer is
 * `pointer-events: none` and must never participate in hit-testing, so a
 * hover preview can never itself be hovered or clicked.
 *
 * This is the general-purpose reusable half of the hover-preview mechanism
 * (see `src/graph/preview.ts` for the diffing half). Any feature that wants
 * to preview a pending change renders this same component with its own
 * candidate graph; it never needs its own ghost-drawing logic.
 */
export function GhostLayer({ baseGraph, basePositions, baseLabels, previewGraph, style }: GhostLayerProps) {
  if (!previewGraph) return null;

  const diff = diffGraphs(baseGraph, previewGraph);
  if (diff.addedAtomIds.size === 0 && diff.changedAtomIds.size === 0 && diff.changedBonds.length === 0) {
    return null;
  }

  // Atoms whose own appearance changed (new, or retyped) need labels/geometry
  // recomputed against the preview graph; anything else reuses the real,
  // already-rendered position/label so a ghost bond lines up exactly with
  // the real atom it's attached to.
  const relabelIds = new Set([...diff.addedAtomIds, ...diff.changedAtomIds]);
  const previewAtomsById = new Map(previewGraph.atoms.map((a) => [a.id, a]));
  const previewPositions = layoutFromRoot(previewGraph, style);
  const previewAngleIns = computeAngleIns(previewGraph, style);
  const previewBondAngles = computeBondAngles(previewGraph, style);

  function positionFor(atomId: string): Point {
    return basePositions.get(atomId) ?? previewPositions.get(atomId)!;
  }

  function labelFor(atomId: string): LabelSpec | null {
    if (!relabelIds.has(atomId) && baseLabels.has(atomId)) return baseLabels.get(atomId) ?? null;
    const atom = previewAtomsById.get(atomId)!;
    return style.label(atom, {
      hydrogenCount: openSlotCount(atom),
      angleIn: previewAngleIns.get(atomId) ?? null,
      bondAngles: previewBondAngles.get(atomId) ?? [],
    });
  }

  return (
    <g opacity={GHOST_OPACITY} pointerEvents="none" aria-hidden="true">
      {diff.changedBonds.map((bond) => (
        <BondView
          key={`ghost-bond-${bond.key}`}
          from={positionFor(bond.atomIdA)}
          to={positionFor(bond.atomIdB)}
          order={bond.order}
          fromLabel={labelFor(bond.atomIdA)}
          toLabel={labelFor(bond.atomIdB)}
          isSelected={false}
          onActivate={() => {}}
        />
      ))}
      {[...diff.addedAtomIds, ...diff.changedAtomIds].map((atomId) => (
        <AtomView
          key={`ghost-atom-${atomId}`}
          atom={previewAtomsById.get(atomId)!}
          position={positionFor(atomId)}
          label={labelFor(atomId)}
          isSelected={false}
          onActivate={() => {}}
        />
      ))}
    </g>
  );
}
