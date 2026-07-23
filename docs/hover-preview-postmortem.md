# Hover preview — what was tried and why it was dropped

The "Hover preview" pull request (`feat/hover-preview`) was **closed without merging**. This
note records what it attempted and the state it was left in, so the idea isn't silently
re-attempted the same way. It is a record of the attempt, not a root-cause diagnosis — no
working version of the hover shipped.

## Goal

Show a translucent "ghost" of the atom and bond a click *would* add, so the user can see the
result of an action before committing to it. Nothing was to be dispatched on hover, so the
molecule name would never change until an actual click.

## What was tried

The attempt introduced a reusable preview seam built from three pieces:

- **`src/graph/preview.ts` — `diffGraphs(base, preview)`**: a pure diff between two graphs,
  reporting added atoms, atoms whose element changed, and bonds that were new or reordered.
- **`src/editor/GhostLayer.tsx`**: rendered that diff translucently and non-interactively
  (`pointer-events: none`), reusing the existing `AtomView` / `BondView` so a ghost looked
  like a faded real atom/bond.
- **`MoleculeEditor`**: lifted stub / growable-hydrogen hover state, built a candidate graph
  with the existing `addAtomFromStub` mutation, and accepted an optional `previewGraph` prop
  so other hover-driven previews could feed the same seam.

The plan was for later work to reuse this seam: an armed-element atom retype would preview a
single-atom recolor, and an armed bond order would preview a single-bond change — each by
handing a candidate graph to the ghost layer on hover.

## Why it was dropped

The hover preview **did not work** in practice, and the PR was closed and rejected rather than
fixed. No reviewer diagnosis was recorded on the PR, so this note deliberately does not assert
a specific technical cause. The takeaway captured here is only the outcome: this ghost-layer
approach to hover previews was abandoned.

## Impact on the follow-up work

Two PRs were originally stacked on top of `feat/hover-preview` and each leaned on the ghost
seam for their own hover preview:

- **Replace atom with armed toolbar item** (`feat/replace-atom`)
- **Change bond order by clicking with an armed bond type** (`feat/replace-bond`)

Because the hover mechanism they depended on never worked, both were **decoupled from it**:
rebased directly onto `main` and stripped of every hover-preview reference (no `GhostLayer`,
no `diffGraphs`, no `previewGraph`). Their click-to-apply behaviour — retype an atom / change a
bond order, pruning branches that no longer fit — is unchanged and stands on its own. Only the
hover *preview* of those changes was removed. They no longer depend on the closed PR in any way.

If hover previews are revisited, start fresh rather than reviving the closed branch.
