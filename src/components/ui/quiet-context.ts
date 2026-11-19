import { createContext } from "react";
import type { SharedValue } from "react-native-reanimated";

/**
 * 1 while a <Quiet> widget is hiding its values, 0 once revealed. `Text` and
 * `Num` read it and fade their ink to transparent — exactly the website's
 * `.quiet[data-quiet="hidden"]` rule, so the component, its rings, bars and
 * chart shapes stay on screen and only the figures and copy go away.
 * `Label` is exempt (the web exempts `.label-soft` / `.metric-card__label`).
 */
export const QuietCtx = createContext<SharedValue<number> | null>(null);

/** Current vertical scroll offset of the enclosing Screen, for scroll-driven reveal. */
export const ScrollYCtx = createContext<SharedValue<number> | null>(null);
