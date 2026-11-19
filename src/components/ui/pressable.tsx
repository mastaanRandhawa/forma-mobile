/**
 * PressScale — the app's one tactile press: a quick, damped spring down on
 * touch and a soft overshoot back on release, with an optional haptic. Runs on
 * the UI thread (Reanimated), so it never competes with JS work. Reduced-motion
 * users get an opacity change instead of movement.
 */
import type { ReactNode } from "react";
import { Pressable, type AccessibilityRole, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { motion } from "@/lib/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const SPRING_PRESS = { damping: 18, stiffness: 420, mass: 0.6 } as const;
export const SPRING_RELEASE = { damping: 12, stiffness: 260, mass: 0.7 } as const;

type Props = Omit<PressableProps, "style" | "children"> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** scale while held (default 0.97) */
  to?: number;
  haptic?: "light" | "medium" | "select" | false;
  accessibilityRole?: AccessibilityRole;
};

export function PressScale({ children, style, to = 0.97, haptic = "select", onPressIn, onPressOut, onPress, disabled, ...rest }: Props) {
  const s = useSharedValue(1);
  const o = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: o.value }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      accessibilityRole={rest.accessibilityRole ?? "button"}
      onPressIn={(e) => {
        if (motion.reduced) o.set(withTiming(0.7, { duration: 90 }));
        else s.set(withSpring(to, SPRING_PRESS));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (motion.reduced) o.set(withTiming(1, { duration: 140 }));
        else s.set(withSpring(1, SPRING_RELEASE));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        else if (haptic === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        else if (haptic === "select") Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={[style, anim, disabled ? { opacity: 0.5 } : null]}
    >
      {children}
    </AnimatedPressable>
  );
}
