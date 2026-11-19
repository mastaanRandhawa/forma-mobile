import { useEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { motion } from "@/lib/motion";
import { EASE_LUXURY } from "@/lib/ease";

/**
 * Reveal — content rises and fades in on mount (the website's `Reveal`).
 * `index` staggers siblings by 55ms so a list cascades instead of popping.
 * Plain shared-value timing (no layout-animation API), so it behaves the same
 * on iOS, Android and web and never disturbs layout.
 */
export function Reveal({ children, index = 0, delay = 0, style }: { children: ReactNode; index?: number; delay?: number; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(motion.reduced ? 1 : 0);
  const y = useSharedValue(motion.reduced ? 0 : 14);
  useEffect(() => {
    if (motion.reduced) return;
    const d = delay + Math.min(index, 8) * 55;
    o.set(withDelay(d, withTiming(1, { duration: 520, easing: EASE_LUXURY })));
    y.set(withDelay(d, withTiming(0, { duration: 560, easing: EASE_LUXURY })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}
