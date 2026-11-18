import { useTheme } from "@/theme/theme-provider";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Svg, { Circle } from "react-native-svg";
import { colors, fonts, radius, shadow, toneColor, type Tone } from "@/theme/tokens";
import { Label, Num, Text } from "./text";
import { RecessedSurface } from "./surface";

type BtnProps = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "accent" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
};

/** Pill buttons: white "Notis" primary, pink-gradient accent, or quiet ghost. */
export function Button({ label, onPress, variant = "primary", loading, disabled, icon, style }: BtnProps) {
  useTheme();
  const off = disabled || loading;
  const ink = variant === "primary" ? colors.btnWhiteInk : colors.onColor;
  return (
    <Pressable
      disabled={off}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          height: 54,
          borderRadius: radius.pill,
          overflow: "hidden",
          opacity: off ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        variant !== "ghost" && shadow.float,
        style,
      ]}
    >
      {variant === "primary" && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.btnWhite }]} />}
      {variant === "accent" && (
        <LinearGradient
          colors={[colors.pink, colors.coral]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {variant === "ghost" && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: radius.pill }]}
        />
      )}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {loading ? <ActivityIndicator color={ink} /> : icon}
        <Text style={{ color: ink, fontFamily: fonts.semibold, fontSize: 16 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string | null; right?: ReactNode };

/** Recessed input well with a floating label above. */
export function Field({ label, error, right, style, ...rest }: FieldProps) {
  useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Label style={{ marginLeft: 4 }}>{label}</Label>
      <RecessedSurface
        radiusSize="small"
        style={{
          borderColor: error ? colors.danger : focus ? "rgba(213,26,122,0.7)" : "rgba(255,255,255,0.03)",
          borderWidth: 1,
        }}
      >
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
      {error ? <Text variant="meta" color="danger" style={{ marginLeft: 4 }}>{error}</Text> : null}
    </View>
  );
}

/** Selectable pill (filters, goals, equipment). */
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={{
        paddingHorizontal: 14,
        height: 36,
        borderRadius: radius.pill,
        justifyContent: "center",
        backgroundColor: active ? colors.btnWhite : colors.surface,
        borderWidth: 1,
        borderColor: active ? "transparent" : colors.lineSoft,
      }}
    >
      <Text style={{ color: active ? colors.btnWhiteInk : colors.textSecondary, fontFamily: fonts.semibold, fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Donut ring — the dashboard's compact stat. pct 0–100. */
export function Ring({ pct, tone = "pink", size = 54, stroke = 5 }: { pct: number; tone?: Tone; size?: number; stroke?: number }) {
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, pct / 100));
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={toneColor[tone]}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * f} ${c}`}
      />
    </Svg>
  );
}

export function RingStat({ label, value, sub, pct, tone = "pink", onPress }: { label: string; value: string; sub?: string; pct: number; tone?: Tone; onPress?: () => void }) {
  useTheme();
  return (
    <View style={{ flex: 1 }}>
      <RecessedSurface radiusSize="medium" style={{ padding: 12, alignItems: "center", gap: 8, minHeight: 124 }}>
        <Pressable onPress={onPress} style={{ alignItems: "center", gap: 8 }}>
          <Label numberOfLines={1}>{label}</Label>
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <Ring pct={pct} tone={tone} />
            <View style={StyleSheet.absoluteFill}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Num size={15}>{value}</Num>
              </View>
            </View>
          </View>
          {sub ? <Text variant="meta" color="tertiary" numberOfLines={1}>{sub}</Text> : null}
        </Pressable>
      </RecessedSurface>
    </View>
  );
}

export function ProgressBar({ pct, tone = "pink", height = 8 }: { pct: number; tone?: Tone; height?: number }) {
  useTheme();
  return (
    <View style={{ height, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.09)", overflow: "hidden" }}>
      <View style={{ height, width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: radius.pill, backgroundColor: toneColor[tone] }} />
    </View>
  );
}

export function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, marginTop: 8 }}>
      <Text variant="heading">{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text variant="meta" color="pink">{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
