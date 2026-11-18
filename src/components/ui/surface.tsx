import { useTheme } from "@/theme/theme-provider";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { colors, radius, shadow } from "@/theme/tokens";

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  radiusSize?: keyof typeof radius;
};

const hairline = "rgba(255,255,255,0.05)";

/** surface-soft — broad molded regions (cards). */
export function SoftSurface({ children, style, onPress, radiusSize = "large" }: Props) {
  useTheme();
  const r = radius[radiusSize];
  const body = (
    <View style={[{ borderRadius: r, borderWidth: 1, borderColor: hairline, overflow: "hidden" }, shadow.soft, style]}>
      <LinearGradient
        colors={["rgba(255,244,250,0.13)", "rgba(255,244,250,0.05)", "rgba(122,23,79,0.06)"]}
        locations={[0, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.topLight} pointerEvents="none" />
      {children}
    </View>
  );
  return onPress ? <Tap onPress={onPress}>{body}</Tap> : body;
}

/** surface-raised — tactile primary controls. */
export function RaisedSurface({ children, style, onPress, radiusSize = "medium" }: Props) {
  useTheme();
  const r = radius[radiusSize];
  const body = (
    <View style={[{ borderRadius: r, borderWidth: 1, borderColor: hairline, overflow: "hidden" }, shadow.raised, style]}>
      <LinearGradient
        colors={["rgba(255,239,248,0.22)", "rgba(255,239,248,0.10)", "rgba(122,23,79,0.08)"]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.topLight, { opacity: 1.3 }]} pointerEvents="none" />
      {children}
    </View>
  );
  return onPress ? <Tap onPress={onPress}>{body}</Tap> : body;
}

/** surface-recessed — carved-in wells: inputs, dial tracks, date strips. */
export function RecessedSurface({ children, style, radiusSize = "medium" }: Props) {
  useTheme();
  return (
    <View
      style={[
        {
          borderRadius: radius[radiusSize],
          backgroundColor: "rgba(34, 10, 28, 0.55)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.03)",
          overflow: "hidden",
        },
        style,
      ]}
    >
      <View style={styles.insetShade} pointerEvents="none" />
      {children}
    </View>
  );
}

/** surface-glass — floating nav and a couple of overlays. */
export function GlassSurface({ children, style, radiusSize = "large" }: Props) {
  useTheme();
  return (
    <View
      style={[
        {
          borderRadius: radius[radiusSize],
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
        },
        style,
      ]}
    >
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient colors={["rgba(41,22,35,0.55)", "rgba(33,18,28,0.42)"]} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

function Tap({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }], opacity: pressed ? 0.95 : 1 })}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topLight: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  insetShade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 14,
    backgroundColor: colors.backgroundDeep,
    opacity: 0.35,
  },
});
