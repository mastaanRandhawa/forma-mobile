import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "@/theme/tokens";

/** Kai's avatar — a breathing gradient orb. `state` changes the glow rhythm. */
export function KaiOrb({ size = 40, state = "idle", look }: { size?: number; state?: "idle" | "thinking" | "happy" | "rest"; look?: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const dur = state === "thinking" ? 700 : 2400;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, state]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, state === "thinking" ? 1.12 : 1.05] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const stops: [string, string, string] = look === "l-ember" ? [colors.orange, colors.coral, colors.wine] : look === "l-ion" ? [colors.cyan, colors.blue, colors.aubergine] : [colors.pinkSoft, colors.pink, colors.wine];

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ position: "absolute", width: size * 1.5, height: size * 1.5, borderRadius: size, backgroundColor: colors.pink, opacity: glow, transform: [{ scale }] }} />
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient colors={stops} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      </Animated.View>
    </View>
  );
}
