import { displayed } from "./displayed";
import { structural } from "./structural";
import { skeletal } from "./skeletal";
import type { RenderStyle, StyleId } from "./types";

export type { RenderStyle, StyleId, LabelSpec, LabelContext, ChildAngleContext } from "./types";

export const STYLES: Record<StyleId, RenderStyle> = { displayed, structural, skeletal };

export const DEFAULT_STYLE: StyleId = "displayed";

export function getStyle(id: StyleId): RenderStyle {
  return STYLES[id];
}
