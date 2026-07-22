import { displayed } from "./displayed";
import { structural } from "./structural";
import type { RenderStyle, StyleId } from "./types";

export type { RenderStyle, StyleId, LabelSpec, LabelContext, ChildAngleContext } from "./types";

/**
 * Skeletal is specified in full in Alkane-Geometry-Design.md but isn't
 * implemented yet — it lands here as a self-contained addition when its
 * build step comes up. `STYLES` stays a `Partial` until all three styles are
 * registered.
 */
export const STYLES: Partial<Record<StyleId, RenderStyle>> = {
  displayed,
  structural,
};

export const DEFAULT_STYLE: StyleId = "displayed";

export function getStyle(id: StyleId): RenderStyle {
  const style = STYLES[id];
  if (!style) throw new Error(`Style not implemented yet: ${id}`);
  return style;
}
