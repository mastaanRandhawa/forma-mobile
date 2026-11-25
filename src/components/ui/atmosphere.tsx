/**
 * Atmosphere — the page ground. One persistent layer mounted at the app root
 * (screens are transparent), so pushing a screen never flashes a background and
 * a theme change cross-fades instead of snapping.
 *
 * It paints the active theme's own `--atmosphere-bg` (the same layered radial
 * gradients the website uses, for both dark and light) over the solid ground,
 * plus three very slow aurora blooms.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useCustomization } from "@/theme/theme-provider";
import { ambient, colors } from "@/theme/tokens";
import { motion } from "@/lib/motion";
import { Fill, Gradient } from "./gradient";

/** True when the app root already paints the atmosphere behind this screen. */
export const AtmosphereHost = createContext(true);
export const useHasGlobalAtmosphere = () => useContext(AtmosphereHost);

type Snap = { bg: string; css: string };
const snap = (): Snap => ({ bg: colors.background, css: ambient.atmosphere });

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

function Aurora({ color, size, left, top, dx, dy, dur }: { color: string; size: number; left: number; top: number; dx: number; dy: number; dur: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (motion.reduced) return;
    t.value = withRepeat(withSequence(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: dur, easing: Easing.inOut(Easing.sin) })), -1);
    return () => cancelAnimation(t);
  }, [t, dur]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * dx }, { translateY: t.value * dy }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", width: size, height: size, left, top, opacity: 0.42 }, style]}>
      <Fill radial={{ cx: 0.5, cy: 0.5, r: 0.5 }} stops={[{ color, at: 0 }, { color, at: 0.0001 }, { color: "rgba(0,0,0,0)", at: 0.66 }, { color: "rgba(0,0,0,0)", at: 1 }]} />
    </Animated.View>
  );
}

export function Atmosphere() {
  const { version } = useCustomization();
  const [current, setCurrent] = useState<Snap>(snap);
  const [prev, setPrev] = useState<Snap | null>(null);
  const fade = useSharedValue(1);
  const seen = useRef(0);

  useEffect(() => {
    const next = snap();
    if (next.bg === current.bg && next.css === current.css) return;
    seen.current++;
    setPrev(current);
    setCurrent(next);
    fade.value = 0;
    fade.value = withTiming(1, { duration: motion.reduced ? 0 : 650, easing: EASE }, (done) => {
      if (done) fade.value = 1;
    });
    const t = setTimeout(() => setPrev(null), motion.reduced ? 0 : 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const topStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const [a1, a2, a3] = ambient.aurora;

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: (prev ?? current).bg }]} />
      {prev ? <Gradient css={prev.css} /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, topStyle]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: current.bg }]} />
        <Gradient css={current.css} />
      </Animated.View>
      <Aurora color={a1} size={420} left={-150} top={-170} dx={50} dy={36} dur={21000} />
      <Aurora color={a2} size={380} left={140} top={260} dx={-44} dy={50} dur={26000} />
      <Aurora color={a3} size={340} left={-120} top={560} dx={40} dy={-44} dur={30000} />
    </View>
  );
}
