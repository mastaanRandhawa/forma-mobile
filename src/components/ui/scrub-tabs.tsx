/**
 * ScrubTabs — one selector with the same interaction model as the TabDock.
 *
 *  • Tap: the indicator springs to the tapped option.
 *  • Touch-and-hold (and, for rows that don't scroll, a plain sideways swipe):
 *    the indicator becomes the finger, a light haptic ticks as it crosses each
 *    option, and lifting commits to whatever it is over.
 *  • Non-gesture routes: options are buttons (tap, keyboard Left/Right,
 *    screen-reader increment/decrement). Reduced motion removes the springs.
 *
 * One shared fractional index (`pos`) drives the indicator and every label.
 * Used by PillTabs (scrollable filter row) and Segmented (full-width track).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { clamp, interpolateColor, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { withAlpha } from "@/lib/color";
import { motion } from "@/lib/motion";
import { PressScale } from "./pressable";
import { RecessedSurface } from "./surface";

type Opt<T> = { value: T; label: string };

const spring = (to: number) => {
  "worklet";
  return motion.reduced ? withTiming(to, { duration: 0 }) : withSpring(to, { damping: 20, stiffness: 260, mass: 0.7 });
};

/** Linear lookup of `arr` at fractional index `p`. */
function at(arr: number[], p: number, n: number) {
  "worklet";
  if (!n) return 0;
  const c = Math.max(0, Math.min(n - 1, p));
  const i = Math.floor(c);
  const j = Math.min(n - 1, i + 1);
  return arr[i] + (arr[j] - arr[i]) * (c - i);
}

function Item({ label, index, active, pos, h, flex, onPress, onKey, onLayout, inkOff, inkOn }: { label: string; index: number; active: boolean; pos: SharedValue<number>; h: number; flex: boolean; onPress: () => void; onKey: (d: -1 | 1) => void; onLayout: (x: number, w: number) => void; inkOff: string; inkOn: string }) {
  const [focused, setFocused] = useState(false);
  const near = useDerivedValue(() => Math.max(0, 1 - Math.abs(pos.get() - index)));
  const ink = useAnimatedStyle(() => ({ color: interpolateColor(near.get(), [0, 1], [inkOff, inkOn]) }));
  const keys = {
    onKeyDown: (e: { key: string; preventDefault?: () => void }) => {
      if (e.key === "ArrowLeft") { e.preventDefault?.(); onKey(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault?.(); onKey(1); }
    },
  };
  return (
    <PressScale
      {...(keys as object)}
      onPress={onPress}
      to={0.96}
      haptic="select"
      hitSlop={{ top: Math.max(0, (44 - h) / 2), bottom: Math.max(0, (44 - h) / 2) }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onLayout={(e: { nativeEvent: { layout: { x: number; width: number } } }) => onLayout(e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={{ height: h, flex: flex ? 1 : undefined, paddingHorizontal: flex ? 6 : 14, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: focused ? withAlpha(colors.pink, 0.8) : "transparent" }}
    >
      <Animated.Text numberOfLines={1} style={[{ fontFamily: fonts.semibold, fontSize: 13 }, ink]}>{label}</Animated.Text>
    </PressScale>
  );
}

export function ScrubTabs<T extends string>({ value, options, onChange, variant, bleed }: { value: T; options: Opt<T>[]; onChange: (v: T) => void; variant: "pill" | "segmented"; bleed?: boolean }) {
  useTheme();
  const n = options.length;
  const seg = variant === "segmented";
  const h = seg ? 36 : 34;
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));

  const pos = useSharedValue(activeIndex);
  const xs = useSharedValue<number[]>(options.map(() => 0));
  const ws = useSharedValue<number[]>(options.map(() => 0));
  const dragging = useSharedValue(0);
  const pressed = useSharedValue(0);
  const lastHover = useSharedValue(activeIndex);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const boxes = useRef<({ x: number; w: number } | undefined)[]>([]);

  const measure = useCallback((i: number, x: number, w: number) => {
    boxes.current[i] = { x, w };
    const b = boxes.current.slice(0, n);
    if (b.length === n && b.every(Boolean)) {
      xs.set(b.map((v) => v!.x));
      ws.set(b.map((v) => v!.w));
      setReady(true);
    }
  }, [n, xs, ws]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { pos.set(activeIndex); first.current = false; return; }
    if (dragging.get() === 0) pos.set(spring(activeIndex));
  }, [activeIndex, pos, dragging]);

  const latest = useRef({ options, onChange, activeIndex });
  latest.current = { options, onChange, activeIndex };
  const commit = useCallback((i: number) => {
    const { options: o, onChange: cb, activeIndex: a } = latest.current;
    if (o[i] && i !== a) cb(o[i].value);
  }, []);
  const tick = useCallback(() => { Haptics.selectionAsync().catch(() => {}); }, []);
  const lift = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }, []);

  const gesture = useMemo(() => {
    const build = (g: ReturnType<typeof Gesture.Pan>, lock: boolean) =>
      g
        .onStart(() => {
          "worklet";
          dragging.set(1);
          pressed.set(withTiming(1, { duration: 120 }));
          runOnJS(lift)();
          if (lock) runOnJS(setLocked)(true);
        })
        .onUpdate((e) => {
          "worklet";
          // finger position → fractional index, measured between option centres
          const x = xs.get();
          const w = ws.get();
          let frac = 0;
          if (n > 1) {
            const cx = e.x;
            if (cx <= x[0] + w[0] / 2) frac = 0;
            else if (cx >= x[n - 1] + w[n - 1] / 2) frac = n - 1;
            else {
              for (let i = 0; i < n - 1; i++) {
                const a = x[i] + w[i] / 2;
                const b = x[i + 1] + w[i + 1] / 2;
                if (cx >= a && cx <= b) { frac = i + (cx - a) / Math.max(1, b - a); break; }
              }
            }
          }
          pos.set(clamp(frac, 0, n - 1));
          const hv = Math.round(frac);
          if (hv !== lastHover.get()) {
            lastHover.set(hv);
            runOnJS(tick)();
          }
        })
        .onFinalize(() => {
          "worklet";
          if (dragging.get() === 0) return;
          dragging.set(0);
          pressed.set(withTiming(0, { duration: 160 }));
          const i = Math.round(pos.get());
          pos.set(spring(i));
          runOnJS(commit)(i);
          if (lock) runOnJS(setLocked)(false);
        });
    const hold = build(Gesture.Pan().activateAfterLongPress(230), !seg);
    // a scrolling row keeps its own horizontal swipe; a fixed row also accepts a plain sideways swipe
    if (!seg) return hold;
    return Gesture.Race(build(Gesture.Pan().activeOffsetX([-9, 9]).failOffsetY([-22, 22]), false), hold);
  }, [n, seg, commit, tick, lift, dragging, pressed, lastHover, pos, xs, ws]);

  const indicator = useAnimatedStyle(() => ({
    width: at(ws.get(), pos.get(), n),
    transform: [{ translateX: at(xs.get(), pos.get(), n) }, { scale: 1 + pressed.get() * 0.06 }],
  }));

  const step = (dir: -1 | 1) => {
    const i = Math.max(0, Math.min(n - 1, activeIndex + dir));
    if (i !== activeIndex) commit(i);
  };

  const inkOff = colors.textSecondary;
  const inkOn = colors.btnWhiteInk;

  const row = (
    <GestureDetector gesture={gesture}>
      <View
        style={{ flexDirection: "row", gap: seg ? 0 : 8, alignSelf: seg ? "stretch" : "flex-start" }}
        accessibilityRole="tablist"
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
      >
        {!seg && ready
          ? options.map((o, i) => (
              <View key={o.value} pointerEvents="none" style={{ position: "absolute", left: boxes.current[i]?.x ?? 0, width: boxes.current[i]?.w ?? 0, height: h, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineSoft }} />
            ))
          : null}
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, height: h, borderRadius: radius.pill, backgroundColor: colors.btnWhite, opacity: ready ? 1 : 0 }, indicator]} />
        {options.map((o, i) => (
          <Item
            key={o.value}
            label={o.label}
            index={i}
            active={i === activeIndex}
            pos={pos}
            h={h}
            flex={seg}
            inkOff={inkOff}
            inkOn={inkOn}
            onKey={step}
            onLayout={(x, w) => measure(i, x, w)}
            onPress={() => commit(i)}
          />
        ))}
      </View>
    </GestureDetector>
  );

  if (seg) return <RecessedSurface radiusSize="pill" style={{ padding: 4 }}>{row}</RecessedSurface>;
  return (
    <ScrollView horizontal scrollEnabled={!locked} showsHorizontalScrollIndicator={false} style={bleed ? { marginHorizontal: -space.page } : undefined} contentContainerStyle={{ paddingVertical: 2, paddingHorizontal: bleed ? space.page : 0 }}>
      {row}
    </ScrollView>
  );
}
