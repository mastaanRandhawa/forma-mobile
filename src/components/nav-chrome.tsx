/**
 * Navigation chrome state — whether the floating tab bar is full or minimized.
 *
 * The website's top bar condenses once you scroll (64px → 56px, more solid).
 * This is the touch equivalent: the dock shrinks to a compact icon-only pill
 * while you scroll down, and returns the moment you scroll back up, reach the
 * top, or tap it. A device preference (Settings › Appearance › Navigation bar)
 * pins it full or compact instead. `minimized` is a 0..1 shared value so every
 * piece of chrome can animate from the same source without re-rendering.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useSharedValue, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { motion } from "@/lib/motion";
import { useDevicePrefs } from "@/lib/device-prefs";

type Ctx = {
  minimized: SharedValue<number>;
  /** feed from a ScrollView's onScroll */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  expand: () => void;
  mode: "auto" | "expanded" | "minimized";
};

const noop = () => {};
const Fallback: Ctx = { minimized: { value: 0 } as SharedValue<number>, onScroll: noop, expand: noop, mode: "auto" };
const NavChromeCtx = createContext<Ctx>(Fallback);
export const useNavChrome = () => useContext(NavChromeCtx);

const SPRING = { damping: 22, stiffness: 240, mass: 0.8 } as const;
const go = (sv: SharedValue<number>, to: number) => {
  sv.set(motion.reduced ? withTiming(to, { duration: 0 }) : withSpring(to, SPRING));
};

export function NavChromeProvider({ children }: { children: ReactNode }) {
  const prefs = useDevicePrefs();
  const mode = prefs.navMode ?? "auto";
  const minimized = useSharedValue(mode === "minimized" ? 1 : 0);
  const last = useRef(0);
  const state = useRef(mode === "minimized" ? 1 : 0);

  useEffect(() => {
    const to = mode === "minimized" ? 1 : 0;
    state.current = to;
    go(minimized, to);
  }, [mode, minimized]);

  const set = useCallback(
    (to: number) => {
      if (state.current === to) return;
      state.current = to;
      go(minimized, to);
    },
    [minimized],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (mode !== "auto") return;
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - last.current;
      last.current = y;
      if (y <= 12) set(0);
      else if (dy > 8 && y > 60) set(1);
      else if (dy < -8) set(0);
    },
    [mode, set],
  );

  const expand = useCallback(() => {
    if (mode === "minimized") return;
    set(0);
  }, [mode, set]);

  const value = useMemo<Ctx>(() => ({ minimized, onScroll, expand, mode }), [minimized, onScroll, expand, mode]);
  return <NavChromeCtx.Provider value={value}>{children}</NavChromeCtx.Provider>;
}
