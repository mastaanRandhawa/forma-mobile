import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Polyline, Rect, Stop, Line, Circle as SvgCircle, G } from "react-native-svg";
import { cardPad, colors, fonts, radius, space, toneColor, type Tone } from "@/theme/tokens";
import { PressScale } from "./pressable";
import { motion } from "@/lib/motion";
import { Label, Text } from "./text";
import { SoftSurface, RecessedSurface, RaisedSurface } from "./surface";
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

/**
 * Bottom sheet — the mobile counterpart of the web's DetailDrawer / modals.
 * Slides up on a spring over a dimmed backdrop (fades in separately), drags
 * down from the handle/header to dismiss, lifts above the keyboard, and keeps
 * an optional sticky `footer` (primary actions) pinned above the home bar.
 */
export function Sheet({
  visible,
  onClose,
  title,
  eyebrow,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [height, setHeight] = useState(640);
  const slide = useRef(new Animated.Value(1)).current; // 0 = open, 1 = off-screen
  const fade = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (visible && motion.reduced) {
      setMounted(true);
      slide.setValue(0);
      fade.setValue(1);
    } else if (!visible && mounted && motion.reduced) {
      setMounted(false);
    } else if (visible) {
      setMounted(true);
      slide.setValue(1);
      Animated.parallel([
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, stiffness: 320, damping: 32, mass: 1 }),
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(slide, { toValue: 1, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => slide.setValue(Math.max(0, g.dy) / Math.max(1, height)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 110 || g.vy > 1.1) closeRef.current();
          else Animated.spring(slide, { toValue: 0, useNativeDriver: true, stiffness: 320, damping: 32 }).start();
        },
      }),
    [slide, height],
  );

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,4,9,0.62)", opacity: fade }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end" }} pointerEvents="box-none">
        <Animated.View
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={{
            maxHeight: "90%",
            backgroundColor: colors.surfaceOpaque,
            borderTopLeftRadius: radius.large,
            borderTopRightRadius: radius.large,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: colors.lineSoft,
            transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) }],
          }}
        >
          <View {...pan.panHandlers}>
            <View style={{ alignItems: "center", paddingTop: 10 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineHighlight }} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 12 }}>
              <View style={{ flex: 1 }}>
                {eyebrow ? <Label numberOfLines={1}>{eyebrow.toUpperCase()}</Label> : null}
                <Text variant="heading" numberOfLines={2}>{title ?? ""}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close sheet">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: footer ? 16 : 24 + insets.bottom, gap: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 + insets.bottom, gap: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>{footer}</View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type MenuAction = { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; destructive?: boolean; hint?: string };

/** Contextual action menu (long-press / "…" button) presented as a compact sheet. */
export function ActionMenu({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: MenuAction[] }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ gap: 0, marginTop: -4 }}>
        {actions.map((a, i) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onClose();
              setTimeout(a.onPress, 240);
            }}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15, minHeight: 50, opacity: pressed ? 0.6 : 1 })}
          >
            {a.icon ? <Ionicons name={a.icon} size={20} color={a.destructive ? colors.danger : colors.textSecondary} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, color: a.destructive ? colors.danger : colors.textPrimary }}>{a.label}</Text>
              {a.hint ? <Text variant="meta" color="tertiary">{a.hint}</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

/** −/value/+ control used for weight, reps, RPE, sets and rest. Tap the value to type. */
export function Stepper({
  label,
  value,
  step,
  onChange,
  suffix,
  min = 0,
  max = 9999,
  compact,
  placeholder = "—",
}: {
  label: string;
  value: number | null;
  step: number;
  onChange: (v: number | null) => void;
  suffix?: string;
  min?: number;
  max?: number;
  compact?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n * 100) / 100));
  const bump = (dir: 1 | -1) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(clamp((value ?? (dir > 0 ? 0 : step)) + dir * step));
  };
  const h = compact ? 40 : 52;
  return (
    <View style={{ flex: 1, gap: 6, minWidth: compact ? 96 : 0 }}>
      <Label style={{ textAlign: "center" }}>{label.toUpperCase()}{suffix ? ` · ${suffix}` : ""}</Label>
      <RecessedSurface radiusSize="small" style={{ flexDirection: "row", alignItems: "center", height: h }}>
        <Pressable onPress={() => bump(-1)} hitSlop={6} accessibilityLabel={`Decrease ${label}`} style={{ width: compact ? 32 : 40, height: h, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="remove" size={compact ? 16 : 20} color={colors.textSecondary} />
        </Pressable>
        <TextInput
          value={text ?? (value == null ? "" : String(value))}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          onFocus={() => setText(value == null ? "" : String(value))}
          onChangeText={setText}
          onBlur={() => {
            const n = parseFloat((text ?? "").replace(",", "."));
            onChange(text == null || text.trim() === "" ? null : Number.isFinite(n) ? clamp(n) : value);
            setText(null);
          }}
          keyboardType="decimal-pad"
          selectTextOnFocus
          accessibilityLabel={label}
          style={{ flex: 1, width: 0, minWidth: 0, textAlign: "center", color: colors.textPrimary, fontFamily: fonts.num, fontSize: compact ? 16 : 22, paddingVertical: 0, paddingHorizontal: 0 }}
        />
        <Pressable onPress={() => bump(1)} hitSlop={6} accessibilityLabel={`Increase ${label}`} style={{ width: compact ? 32 : 40, height: h, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="add" size={compact ? 16 : 20} color={colors.textSecondary} />
        </Pressable>
      </RecessedSurface>
    </View>
  );
}

/** Draggable horizontal slider (0–1 by default). Snaps to `step`; haptic tick on change. */
export function SliderBar({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 1,
  step = 0.05,
  tone = "pink",
  accessibilityLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  tone?: Tone;
  accessibilityLabel?: string;
}) {
  const [w, setW] = useState(1);
  const last = useRef(value);
  const cb = useRef({ onChange, onCommit });
  cb.current = { onChange, onCommit };
  const toValue = (x: number) => {
    const raw = min + Math.max(0, Math.min(1, x / Math.max(1, w))) * (max - min);
    return Math.round(Math.round(raw / step) * step * 1000) / 1000;
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const v = toValue(e.nativeEvent.locationX);
          if (v !== last.current) Haptics.selectionAsync().catch(() => {});
          last.current = v;
          cb.current.onChange(v);
        },
        onPanResponderMove: (e) => {
          const v = toValue(e.nativeEvent.locationX);
          if (v !== last.current) {
            last.current = v;
            Haptics.selectionAsync().catch(() => {});
            cb.current.onChange(v);
          }
        },
        onPanResponderRelease: () => cb.current.onCommit?.(last.current),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, min, max, step],
  );
  const pct = ((Math.max(min, Math.min(max, value)) - min) / (max - min || 1)) * 100;
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      onAccessibilityAction={(e) => {
        const next = Math.max(min, Math.min(max, value + (e.nativeEvent.actionName === "increment" ? step : -step)));
        onChange(next);
        onCommit?.(next);
      }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      style={{ height: 32, justifyContent: "center" }}
    >
      <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)" }}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: toneColor[tone] }} />
      </View>
      <View pointerEvents="none" style={{ position: "absolute", left: `${pct}%`, marginLeft: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.btnWhite, borderWidth: 3, borderColor: toneColor[tone] }} />
    </View>
  );
}

/** Pill tab row that scrolls horizontally — used for sub-navigation and filters. */
/**
 * PillTabs — a single horizontally scrolling row of filter pills (never wraps).
 * `bleed` lets the row scroll edge to edge past the page margin instead of
 * being clipped at it; pills are 34pt tall with a 44pt touch area.
 */
export function PillTabs<T extends string>({ value, options, onChange, bleed }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; bleed?: boolean }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={bleed ? { marginHorizontal: -space.page } : undefined} contentContainerStyle={{ gap: 8, paddingVertical: 2, paddingHorizontal: bleed ? space.page : 0 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            hitSlop={{ top: 5, bottom: 5 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={{ paddingHorizontal: 14, height: 34, borderRadius: radius.pill, justifyContent: "center", backgroundColor: active ? colors.btnWhite : colors.surface, borderWidth: 1, borderColor: active ? "transparent" : colors.lineSoft }}
          >
            <Text style={{ fontSize: 13, fontFamily: fonts.semibold, color: active ? colors.btnWhiteInk : colors.textSecondary }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
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
export function SettingRow({ title, hint, right, onPress, icon }: { title: string; hint?: string; right?: ReactNode; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap; /** kept for call-site compatibility — rows no longer draw dividers */ last?: boolean }) {
  return (
    <PressScale disabled={!onPress} onPress={onPress} to={0.99} haptic="select" accessibilityRole={onPress ? "button" : "text"} accessibilityLabel={hint ? `${title}, ${hint}` : title} style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, paddingVertical: 9 }}>
      {icon ? <Ionicons name={icon} size={20} color={colors.textSecondary} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16 }}>{title}</Text>
        {hint ? <Text variant="meta" color="tertiary" style={{ fontSize: 13 }}>{hint}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} /> : null)}
    </PressScale>
  );
}

const CardDepth = createContext(0);

export type CardVariant = "default" | "compact" | "hero" | "flat";

/**
 * Card — the one content surface.
 *  default  20pt padding, soft gradient surface
 *  compact  16pt, for previews and dense lists
 *  hero     24pt raised surface, the single primary card on a screen
 *  flat     no surface or padding, for grouping inside an existing card
 * Cards never nest: a Card rendered inside another Card automatically drops to
 * `flat`, so inner content reads as part of the outer card instead of a box in a box.
 */
export function Card({ children, style, title, variant = "default" }: { children: ReactNode; style?: StyleProp<ViewStyle>; title?: string; variant?: CardVariant }) {
  const depth = useContext(CardDepth);
  const kind: CardVariant = depth > 0 ? "flat" : variant;
  const head = title ? <Label style={{ marginBottom: 10 }}>{title.toUpperCase()}</Label> : null;
  let body: ReactNode;
  if (kind === "flat") {
    body = <View style={[{ marginBottom: depth > 0 ? 12 : 16 }, style]}>{head}{children}</View>;
  } else if (kind === "hero") {
    body = <RaisedSurface radiusSize="large" style={[{ padding: cardPad.hero, marginBottom: 16 }, style]}>{head}{children}</RaisedSurface>;
  } else {
    body = <SoftSurface radiusSize={kind === "compact" ? "medium" : "large"} style={[{ padding: kind === "compact" ? cardPad.compact : cardPad.default, marginBottom: 16 }, style]}>{head}{children}</SoftSurface>;
  }
  return <CardDepth.Provider value={depth + 1}>{body}</CardDepth.Provider>;
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

/**
 * EmptyState — nothing here yet. With a next action it is a card (title, one
 * line, button); without one it's just a quiet centered line, never an
 * oversized box around a single sentence.
 */
export function EmptyState({ title, body, action, onAction }: { title: string; body?: string; action?: string; onAction?: () => void }) {
  if (!action) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 18, gap: 4 }}>
        <Text color="secondary" style={{ textAlign: "center" }}>{title}</Text>
        {body ? <Text variant="meta" color="tertiary" style={{ textAlign: "center" }}>{body}</Text> : null}
      </View>
    );
  }
  return (
    <RecessedSurface radiusSize="large" style={{ padding: 22, alignItems: "center", gap: 6 }}>
      <Text variant="cardTitle" style={{ textAlign: "center" }}>{title}</Text>
      {body ? <Text color="secondary" style={{ textAlign: "center" }}>{body}</Text> : null}
      <View style={{ marginTop: 12, alignSelf: "stretch" }}><Button label={action} onPress={onAction} /></View>
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
          <G key={i}>
            <Path d={`M${pts.join(" L")} L${px(s.data.length - 1)},${height} L${px(0)},${height} Z`} fill={`url(#ag${i})`} />
            <Polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          </G>
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

/**
 * Line chart you can scrub with a finger — the touch version of the website's
 * hover TrendCurve. Shows the latest value by default; while dragging, a guide
 * line and a value bubble follow the finger.
 */
export function ScrubChart({ data, labels, unit = "", color = colors.pink, height = 150 }: { data: number[]; labels?: string[]; unit?: string; color?: string; height?: number }) {
  const [w, setW] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  const pad = 14;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const idxAt = (px: number) => Math.max(0, Math.min(data.length - 1, Math.round(((px - pad) / Math.max(1, w - pad * 2)) * (data.length - 1))));
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => true,
        onPanResponderGrant: (e) => setHover(idxAt(e.nativeEvent.locationX)),
        onPanResponderMove: (e) => {
          const i = idxAt(e.nativeEvent.locationX);
          setHover((cur) => {
            if (cur !== i) Haptics.selectionAsync().catch(() => {});
            return i;
          });
        },
        onPanResponderRelease: () => setHover(null),
        onPanResponderTerminate: () => setHover(null),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, data.length],
  );
  if (data.length < 2) return null;
  const hi = hover ?? data.length - 1;
  const line = data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const bx = Math.min(Math.max(x(hi), 40), w - 40);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} {...responder.panHandlers} accessibilityLabel={`Trend, latest ${data[data.length - 1]} ${unit}`}>
      <Svg width={w} height={height}>
        <Defs>
          <SvgGradient id="scrub-fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.22} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </SvgGradient>
        </Defs>
        <Line x1={pad} x2={w - pad} y1={height - pad} y2={height - pad} stroke={colors.lineSoft} strokeWidth={1} />
        <Path d={`M${x(0)},${height - pad} L${line.split(" ").join(" L")} L${x(data.length - 1)},${height - pad} Z`} fill="url(#scrub-fill)" />
        <Polyline points={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {hover != null ? <Line x1={x(hi)} x2={x(hi)} y1={pad} y2={height - pad} stroke="rgba(255,255,255,0.22)" strokeWidth={1} /> : null}
        <SvgCircle cx={x(hi)} cy={y(data[hi])} r={5} fill={color} />
      </Svg>
      {hover != null ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: bx - 40, width: 80, alignItems: "center" }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surfaceOpaque, borderWidth: 1, borderColor: colors.lineSoft }}>
            <Text style={{ fontFamily: fonts.num, fontSize: 12 }}>{data[hi]} {unit}</Text>
            {labels?.[hi] ? <Text variant="meta" color="tertiary" style={{ fontSize: 10, textAlign: "center" }}>{labels[hi]}</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** A labelled ring with a big number in the middle — used for goals and kcal. */
export function RingValue({ pct, size = 48, stroke = 5, tone = "pink", color, children }: { pct: number; size?: number; stroke?: number; tone?: Tone; color?: string; children?: ReactNode }) {
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, pct / 100));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} fill="none" />
        <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke={color ?? toneColor[tone]} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} />
      </Svg>
      {children}
    </View>
  );
}
