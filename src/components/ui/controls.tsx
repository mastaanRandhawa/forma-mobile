import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import Animated, { interpolateColor, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "@/theme/theme-provider";
import { HIT, colors, fonts, radius, shadow, toneColor, type Tone } from "@/theme/tokens";
import { withAlpha } from "@/lib/color";
import { motion } from "@/lib/motion";
import { DUR, EASE_LUXURY } from "@/lib/ease";
import { Fill } from "./gradient";
import { CountUp } from "./count-up";
import { PressScale } from "./pressable";
import { RecessedSurface } from "./surface";
import { Label, Text } from "./text";

type BtnProps = {
  label: string;
  onPress?: () => void;
  /**
   * primary    accent gradient — the one main action on a screen
   * secondary  quiet filled pill
   * text       tertiary, accent-coloured text only
   * (legacy names: "accent" = primary, "ghost" = secondary)
   */
  variant?: "primary" | "secondary" | "text" | "accent" | "ghost";
  /** md = 54pt, sm = 44pt (the minimum touch target) */
  size?: "md" | "sm";
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = "primary", size = "md", loading, disabled, icon, style }: BtnProps) {
  useTheme();
  const kind = variant === "accent" ? "primary" : variant === "ghost" ? "secondary" : variant;
  const off = disabled || loading;
  const ink = kind === "primary" ? colors.onAccent : kind === "text" ? colors.pink : colors.textPrimary;
  const h = size === "sm" ? HIT : 54;
  return (
    <PressScale
      disabled={off}
      onPress={onPress}
      haptic="light"
      to={0.975}
      accessibilityLabel={label}
      style={[{ height: kind === "text" ? HIT : h, borderRadius: radius.pill, overflow: "hidden", justifyContent: "center" }, kind === "primary" ? shadow.float : null, style]}
    >
      {kind === "primary" && <Fill angle={135} stops={[{ color: colors.pink, at: 0 }, { color: colors.coral, at: 1 }]} />}
      {kind === "primary" && <Fill angle={180} stops={[{ color: "rgba(255,255,255,0.22)", at: 0 }, { color: "rgba(255,255,255,0)", at: 0.5 }]} />}
      {kind === "secondary" && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, borderRadius: radius.pill }]} />}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: kind === "text" ? 8 : 0 }}>
        {loading ? <ActivityIndicator color={ink} /> : icon}
        <Text style={{ color: ink, fontFamily: fonts.semibold, fontSize: size === "sm" || kind === "text" ? 15 : 16 }}>{label}</Text>
      </View>
    </PressScale>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string | null; right?: ReactNode };

/** Recessed input well. The ring eases to the accent on focus; errors shake once. */
export function Field({ label, error, right, style, ...rest }: FieldProps) {
  useTheme();
  const [focus, setFocus] = useState(false);
  const f = useSharedValue(0);
  const shake = useSharedValue(0);
  useEffect(() => {
    f.value = withTiming(focus ? 1 : 0, { duration: DUR.hover, easing: EASE_LUXURY });
  }, [focus, f]);
  useEffect(() => {
    if (error && !motion.reduced) shake.value = withSequence(withTiming(-6, { duration: 55 }), withTiming(6, { duration: 80 }), withTiming(-4, { duration: 70 }), withTiming(0, { duration: 60 }));
  }, [error, shake]);
  // resolved here (JS thread) and captured by value — worklets can't call JS helpers
  // or read the live theme object
  const ringIdle = colors.hairline;
  const focusRing = withAlpha(colors.pink, 0.75);
  const danger = colors.danger;
  const ring = useAnimatedStyle(() => ({
    borderColor: error ? danger : interpolateColor(f.value, [0, 1], [ringIdle, focusRing]),
    transform: [{ translateX: shake.value }],
  }));
  return (
    <View style={{ gap: 6 }}>
      <Label style={{ marginLeft: 4, color: focus ? colors.textSecondary : colors.textTertiary }}>{label}</Label>
      <Animated.View style={[{ borderRadius: radius.small, borderWidth: 1.5 }, ring]}>
        <RecessedSurface radiusSize="small" style={{ borderWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TextInput
              placeholderTextColor={colors.textTertiary}
              selectionColor={colors.pink}
              onFocus={() => setFocus(true)}
              onBlur={() => setFocus(false)}
              style={[{ flex: 1, height: 52, paddingHorizontal: 16, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 }, style]}
              {...rest}
            />
            {right}
          </View>
        </RecessedSurface>
      </Animated.View>
      {error ? <Text variant="meta" color="danger" style={{ marginLeft: 4 }}>{error}</Text> : null}
    </View>
  );
}

/** Selectable pill — the fill and ink cross-fade instead of snapping. */
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  useTheme();
  const a = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    a.value = withTiming(active ? 1 : 0, { duration: motion.reduced ? 0 : 200, easing: EASE_LUXURY });
  }, [active, a]);
  const bg = useAnimatedStyle(() => ({ opacity: a.value }));
  const inkOff = colors.textSecondary;
  const inkOn = colors.btnWhiteInk;
  const ink = useAnimatedStyle(() => ({ color: interpolateColor(a.value, [0, 1], [inkOff, inkOn]) }));
  return (
    <PressScale onPress={onPress} to={0.95} hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }} accessibilityRole="button" accessibilityState={{ selected: !!active }} style={{ paddingHorizontal: 14, height: 36, borderRadius: radius.pill, justifyContent: "center", overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: active ? "transparent" : colors.lineSoft }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.btnWhite }, bg]} />
      <Animated.Text style={[{ fontFamily: fonts.semibold, fontSize: 13 }, ink]}>{label}</Animated.Text>
    </PressScale>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Donut ring — fills from empty to its value with the website's ease. pct 0–100. */
export function Ring({ pct, tone = "pink", size = 54, stroke = 5 }: { pct: number; tone?: Tone; size?: number; stroke?: number }) {
  useTheme();
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, pct / 100));
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(f, { duration: motion.reduced ? 0 : 900, easing: EASE_LUXURY });
  }, [f, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={withAlpha(colors.textPrimary, 0.09)} strokeWidth={stroke} />
      <AnimatedCircle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={toneColor[tone]} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c} ${c}`} animatedProps={props} />
    </Svg>
  );
}

export function RingStat({ label, value, sub, pct, tone = "pink", onPress }: { label: string; value: string; sub?: string; pct: number; tone?: Tone; onPress?: () => void }) {
  useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PressScale onPress={onPress} disabled={!onPress} to={0.965} haptic="select" accessibilityLabel={`${label} ${value}`}>
        <RecessedSurface radiusSize="medium" style={{ padding: 12, alignItems: "center", gap: 8, minHeight: 124 }}>
          <Label numberOfLines={1}>{label}</Label>
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <Ring pct={pct} tone={tone} />
            <View style={StyleSheet.absoluteFill}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <CountUp value={value} size={15} />
              </View>
            </View>
          </View>
          {sub ? <Text variant="meta" color="tertiary" numberOfLines={1}>{sub}</Text> : null}
        </RecessedSurface>
      </PressScale>
    </View>
  );
}

export function ProgressBar({ pct, tone = "pink", height = 8 }: { pct: number; tone?: Tone; height?: number }) {
  useTheme();
  const w = useSharedValue(0);
  const target = Math.max(0, Math.min(100, pct));
  useEffect(() => {
    w.value = withTiming(target, { duration: motion.reduced ? 0 : 800, easing: EASE_LUXURY });
  }, [target, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View style={{ height, borderRadius: radius.pill, backgroundColor: withAlpha(colors.textPrimary, 0.09), overflow: "hidden" }}>
      <Animated.View style={[{ height, borderRadius: radius.pill, backgroundColor: toneColor[tone] }, fill]} />
    </View>
  );
}

export function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, marginTop: 8 }}>
      <Text variant="section">{title}</Text>
      {action ? (
        <PressScale onPress={onAction} hitSlop={10} to={0.94}>
          <Text variant="meta" color="pink">{action}</Text>
        </PressScale>
      ) : null}
    </View>
  );
}
