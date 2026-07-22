import { displayed } from "./displayed";
import type { RenderStyle, StyleId } from "./types";

export type { RenderStyle, StyleId, LabelSpec, LabelContext, ChildAngleContext } from "./types";

/**
 * Structural and skeletal are specified in full in Alkane-Geometry-Design.md
 * but aren't implemented yet — they land here as self-contained additions
 * when their build step comes up. Until then "displayed" is the only style
 * actually reachable (no switcher UI ships with one style), but `EditorState`
 * already threads a `StyleId` through so the plumbing doesn't need revisiting.
 */
export const STYLES: Partial<Record<StyleId, RenderStyle>> = {
  displayed,
};

export const DEFAULT_STYLE: StyleId = "displayed";

export function getStyle(id: StyleId): RenderStyle {
  const style = STYLES[id];
  if (!style) throw new Error(`Style not implemented yet: ${id}`);
  return style;
}
