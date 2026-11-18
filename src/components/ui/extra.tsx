import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Polyline, Rect, Stop, Line, Circle as SvgCircle } from "react-native-svg";
import { colors, radius, toneColor, type Tone } from "@/theme/tokens";
import { Label, Text } from "./text";
import { SoftSurface, RecessedSurface } from "./surface";
import { Button } from "./controls";

/** Page header with back chevron, used by every pushed screen. */
export function PageHeader({ title, subtitle, back = true, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View style={{ marginBottom: 20, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36 }}>
        {back ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/dashboard"))} hitSlop={12} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
            <Text variant="meta" color="secondary">Back</Text>
          </Pressable>
        ) : <View />}
        {right}
      </View>
      <Text variant="title">{title}</Text>
      {subtitle ? <Text color="secondary">{subtitle}</Text> : null}
    </View>
  );
}

/** Bottom sheet — the mobile counterpart of the web's DetailDrawer / modals. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(10,4,9,0.6)" }} />
      <View style={{ maxHeight: "86%", backgroundColor: colors.backgroundSoft, borderTopLeftRadius: radius.large, borderTopRightRadius: radius.large, borderWidth: 1, borderColor: colors.lineSoft }}>
        <View style={{ alignItems: "center", paddingTop: 10 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineHighlight }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
          <Text variant="heading">{title ?? ""}</Text>
          <Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={22} color={colors.textSecondary} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ false: "rgba(255,255,255,0.14)", true: colors.pink }}
      thumbColor={colors.btnWhite}
      ios_backgroundColor="rgba(255,255,255,0.14)"
    />
  );
}

/** A settings row: title + hint on the left, a control or chevron on the right. */
export function SettingRow({ title, hint, right, onPress, icon, last }: { title: string; hint?: string; right?: ReactNode; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap; last?: boolean }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.lineSoft,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={19} color={colors.textSecondary} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16 }}>{title}</Text>
        {hint ? <Text variant="meta" color="tertiary" style={{ fontSize: 13 }}>{hint}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} /> : null)}
    </Pressable>
  );
}

export function Card({ children, style, title }: { children: ReactNode; style?: StyleProp<ViewStyle>; title?: string }) {
  return (
    <SoftSurface style={[{ padding: 18, marginBottom: 14 }, style]}>
      {title ? <Label style={{ marginBottom: 6 }}>{title.toUpperCase()}</Label> : null}
      {children}
    </SoftSurface>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <RecessedSurface radiusSize="pill" style={{ flexDirection: "row", padding: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ flex: 1, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.btnWhite : "transparent" }}>
            <Text style={{ fontSize: 13, color: active ? colors.btnWhiteInk : colors.textSecondary }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </RecessedSurface>
  );
}

export function EmptyState({ title, body, action, onAction }: { title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <RecessedSurface radiusSize="large" style={{ padding: 28, alignItems: "center", gap: 8 }}>
      <Text variant="heading" style={{ textAlign: "center" }}>{title}</Text>
      {body ? <Text color="secondary" style={{ textAlign: "center" }}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 10, alignSelf: "stretch" }}><Button label={action} onPress={onAction} /></View> : null}
    </RecessedSurface>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return <EmptyState title="Something went wrong" body={message ?? "Couldn't load this. Check your connection."} action="Try again" onAction={onRetry} />;
}

/** Pulsing placeholder block. */
export function Skel({ h = 16, w = "100%", r = 10, style }: { h?: number; w?: number | `${number}%`; r?: number; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 0.9, duration: 800, useNativeDriver: true }), Animated.timing(a, { toValue: 0.4, duration: 800, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={[{ height: h, width: w, borderRadius: r, backgroundColor: "rgba(255,255,255,0.12)", opacity: a }, style]} />;
}

export function PageSkeleton() {
  return (
    <View style={{ gap: 14 }}>
      <Skel h={34} w="60%" />
      <Skel h={16} w="80%" />
      <Skel h={120} r={28} />
      <Skel h={120} r={28} />
    </View>
  );
}

/** Area/line chart over a numeric series. */
export function AreaChart({ series, height = 140, width = 320 }: { series: { color: string; data: number[] }[]; height?: number; width?: number }) {
  const all = series.flatMap((s) => s.data);
  const max = Math.max(1, ...all);
  const n = Math.max(...series.map((s) => s.data.length), 2);
  const px = (i: number) => (i / (n - 1)) * (width - 8) + 4;
  const py = (v: number) => height - 8 - (v / max) * (height - 20);
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <Defs>
        {series.map((s, i) => (
          <SvgGradient key={i} id={`ag${i}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={s.color} stopOpacity={0.35} />
            <Stop offset="1" stopColor={s.color} stopOpacity={0} />
          </SvgGradient>
        ))}
      </Defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <Line key={f} x1={0} x2={width} y1={height * f} y2={height * f} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      ))}
      {series.map((s, i) => {
        const pts = s.data.map((v, j) => `${px(j)},${py(v)}`);
        if (pts.length < 2) return null;
        return (
          <View key={i}>
            <Path d={`M${pts.join(" L")} L${px(s.data.length - 1)},${height} L${px(0)},${height} Z`} fill={`url(#ag${i})`} />
            <Polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          </View>
        );
      })}
    </Svg>
  );
}

export function MiniBars({ data, tone = "pink", height = 56 }: { data: number[]; tone?: Tone; height?: number }) {
  const max = Math.max(1, ...data);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height }}>
      {data.map((v, i) => (
        <View key={i} style={{ flex: 1, height: Math.max(3, (v / max) * height), borderRadius: 4, backgroundColor: toneColor[tone], opacity: v ? 1 : 0.18 }} />
      ))}
    </View>
  );
}

export function Sparkline({ data, color = colors.pink, height = 34, width = 100 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 3 - ((v - min) / span) * (height - 6)}`).join(" ");
  return (
    <Svg width={width} height={height}>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Large circular dial, used for readiness etc. */
export function Dial({ pct, size = 140, tone = "pink", children }: { pct: number; size?: number; tone?: Tone; children?: ReactNode }) {
  const sw = 10;
  const r = size / 2 - sw;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, pct / 100));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.09)" strokeWidth={sw} fill="none" />
        <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke={toneColor[tone]} strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} />
      </Svg>
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.lineSoft, marginVertical: 8 }} />;
}

export function Bar({ pct, tone = "pink" }: { pct: number; tone?: Tone }) {
  return (
    <Svg width="100%" height={8}>
      <Rect x={0} y={0} width="100%" height={8} rx={4} fill="rgba(255,255,255,0.09)" />
      <Rect x={0} y={0} width={`${Math.max(0, Math.min(100, pct))}%`} height={8} rx={4} fill={toneColor[tone]} />
    </Svg>
  );
}
