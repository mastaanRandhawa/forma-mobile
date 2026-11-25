/**
 * Breathe — box breathing (in 4 · hold 4 · out 4 · hold 4) with a circle
 * that grows and shrinks and a soft haptic on each phase change. Four breaths
 * (~64 s), or until rest runs out. Reduced-motion users get the count only.
 */
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { motion } from "@/lib/motion";
import { useTheme } from "@/theme/theme-provider";
import { colors } from "@/theme/tokens";
import { Button } from "@/components/ui/controls";
import { Label, Num, Text } from "@/components/ui/text";
import type { GameProps } from "./host";

const STEP = 4;
const BREATHS = 4;
const PHASES = [
  { label: "Breathe in", scale: 1 },
  { label: "Hold", scale: 1 },
  { label: "Breathe out", scale: 0.55 },
  { label: "Hold", scale: 0.55 },
] as const;

export function Breathe({ onDone }: GameProps) {
  useTheme();
  const [tick, setTick] = useState(0); // seconds elapsed
  const scale = useSharedValue(0.55);
  const done = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setTick((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const phaseIdx = Math.floor(tick / STEP) % PHASES.length;
  const breaths = Math.floor(tick / (STEP * PHASES.length));
  const phase = PHASES[phaseIdx];
  const count = STEP - (tick % STEP);

  // each phase change: animate the circle and give a soft tap
  useEffect(() => {
    if (breaths >= BREATHS) return;
    scale.set(withTiming(phase.scale, { duration: motion.reduced ? 0 : STEP * 1000, easing: Easing.inOut(Easing.sin) }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [phaseIdx, breaths, phase.scale, scale]);

  useEffect(() => {
    if (breaths >= BREATHS && !done.current) {
      done.current = true;
      onDone(BREATHS, "Heart rate down, head clear. You're ready.");
    }
  }, [breaths, onDone]);

  const circle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 22 }}>
      <Label>BREATH {Math.min(breaths + 1, BREATHS)} OF {BREATHS}</Label>
      <View style={{ width: 260, height: 260, alignItems: "center", justifyContent: "center" }}>
        <View style={{ position: "absolute", width: 260, height: 260, borderRadius: 130, borderWidth: 1, borderColor: colors.lineSoft }} />
        <Animated.View style={[{ position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(131,233,244,0.22)", borderWidth: 2, borderColor: colors.cyan }, circle]} />
        <Num size={56}>{count}</Num>
      </View>
      <Text variant="heading" accessibilityLiveRegion="polite">{phase.label}</Text>
      <Button label="I'm ready" variant="secondary" onPress={() => !done.current && ((done.current = true), onDone(Math.max(1, breaths), "Good reset."))} style={{ alignSelf: "stretch", marginTop: "auto" }} />
    </View>
  );
}
