/**
 * TabDock — the app's floating tab bar.
 *
 * Interaction model (modelled on the iOS tab bar, not copied from it):
 *  • Tap an item to go there. The selection indicator springs across.
 *  • Touch-and-hold, or just start sliding sideways, and the indicator becomes
 *    the finger: it follows continuously, items grow/brighten by how close the
 *    indicator is to them, a light haptic ticks as you cross each one, and
 *    lifting the finger commits to whatever it's over. Vertical movement never
 *    activates it, so scrolling and system gestures are untouched.
 *  • Everything has a non-gesture route: items are plain buttons (tap, keyboard
 *    Left/Right, screen-reader increment/decrement).
 *  • Minimizing (scroll down, or the Appearance preference) shrinks the bar to
 *    a compact icon-only pill, same destinations, 44pt targets. Tapping the
 *    active item expands it again.
 *
 * One shared fractional index (`pos`) drives the indicator and every item, so
 * the tap spring and the drag are the same motion at different inputs.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { clamp, interpolate, interpolateColor, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/build/layouts/Tabs";
import { GlassSurface } from "@/components/ui/surface";
import { PressScale } from "@/components/ui/pressable";
import { motion } from "@/lib/motion";
import { useTheme } from "@/theme/theme-provider";
import { withAlpha } from "@/lib/color";
import { colors, fonts, radius, shadow } from "@/theme/tokens";
import { useNavChrome } from "./nav-chrome";

type Meta = { label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap };
export const TABS: Record<string, Meta> = {
  dashboard: { label: "Home", icon: "home-outline", active: "home" },
  workouts: { label: "Train", icon: "barbell-outline", active: "barbell" },
  nutrition: { label: "Nutrition", icon: "nutrition-outline", active: "nutrition" },
  trainer: { label: "Coach", icon: "chatbubble-ellipses-outline", active: "chatbubble-ellipses" },
};

const PAD = 6;
const ITEM_FULL = 52;
const ITEM_MIN = 44;
const SLOT_MIN = 56;
export const PLUS = 52;
export const GAP = 12;
/** height of the pill when full / minimized — also used to place floating accessories */
export const DOCK_FULL = ITEM_FULL + PAD * 2;
export const DOCK_MIN = ITEM_MIN + PAD * 2;

const spring = (to: number) => (motion.reduced ? withTiming(to, { duration: 0 }) : withSpring(to, { damping: 20, stiffness: 260, mass: 0.7 }));

function TabItem({ meta, index, active, pos, minimized, onPress, onKey }: { meta: Meta; index: number; active: boolean; pos: { value: number }; minimized: { value: number }; onPress: () => void; onKey: (dir: -1 | 1) => void }) {
  const [focused, setFocused] = useState(false);
  const near = useDerivedValue(() => Math.max(0, 1 - Math.abs(pos.value - index)));
  const box = useAnimatedStyle(() => ({ height: interpolate(minimized.value, [0, 1], [ITEM_FULL, ITEM_MIN]) }));
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: 1 + near.value * 0.12 }, { translateY: -near.value * 1.5 * (1 - minimized.value) }] }));
  const label = useAnimatedStyle(() => ({ opacity: (0.6 + near.value * 0.4) * (1 - minimized.value), height: 12 * (1 - minimized.value), marginTop: 2 * (1 - minimized.value) }));
  const tint = useAnimatedStyle(() => ({ color: interpolateColor(near.value, [0, 1], [colors.textTertiary, colors.textPrimary]) }));
  const keys = { onKeyDown: (e: { key: string; preventDefault?: () => void }) => {
    if (e.key === "ArrowLeft") { e.preventDefault?.(); onKey(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault?.(); onKey(1); }
  } };
  return (
    <PressScale
      {...(keys as object)}
      onPress={onPress}
      to={0.92}
      haptic="select"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="tab"
      accessibilityLabel={meta.label}
      accessibilityState={{ selected: active }}
      style={{ flex: 1 }}
    >
      <Animated.View style={[{ alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 2, borderColor: focused ? withAlpha(colors.pink, 0.8) : "transparent" }, box]}>
        <Animated.View style={icon}>
          <Ionicons name={active ? meta.active : meta.icon} size={21} color={active ? colors.textPrimary : colors.textTertiary} />
        </Animated.View>
        <Animated.View style={[{ overflow: "hidden", justifyContent: "center" }, label]}>
          <Animated.Text numberOfLines={1} style={[{ fontFamily: fonts.semibold, fontSize: 10.5, lineHeight: 12 }, tint]}>{meta.label}</Animated.Text>
        </Animated.View>
      </Animated.View>
    </PressScale>
  );
}

export function TabDock({ state, navigateToTab }: BottomTabBarProps) {
  useTheme();
  const insets = useSafeAreaInsets();
  const { minimized, expand } = useNavChrome();
  const routes = useMemo(() => state.routes.filter((r) => TABS[r.name]), [state.routes]);
  const n = routes.length;
  const activeIndex = Math.max(0, routes.findIndex((r) => r.key === state.routes[state.index]?.key));

  const cw = useSharedValue(360);
  const pos = useSharedValue(activeIndex);
  const dragging = useSharedValue(0);
  const pressed = useSharedValue(0);
  const lastHover = useSharedValue(activeIndex);
  const [mounted, setMounted] = useState(false);

  const fullW = useDerivedValue(() => Math.max(SLOT_MIN * n + PAD * 2, cw.value - PLUS - GAP));
  const minW = SLOT_MIN * n + PAD * 2;
  const pillW = useDerivedValue(() => interpolate(minimized.value, [0, 1], [fullW.value, minW]));
  const slot = useDerivedValue(() => (pillW.value - PAD * 2) / n);

  // follow navigation state (taps, deep links, back) unless a finger is driving
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      pos.set(activeIndex);
      first.current = false;
      setMounted(true);
      return;
    }
    if (dragging.value === 0) pos.set(spring(activeIndex));
  }, [activeIndex, pos, dragging]);

  const select = (i: number) => {
    const r = routes[i];
    if (r && i !== activeIndex) navigateToTab(r.key);
  };
  const tick = () => Haptics.selectionAsync().catch(() => {});
  const lift = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  const pan = useMemo(() => {
    const build = (g: ReturnType<typeof Gesture.Pan>) =>
      g
        .onStart(() => {
          dragging.set(1);
          pressed.set(withTiming(1, { duration: 120 }));
          runOnJS(lift)();
        })
        .onUpdate((e) => {
          const frac = clamp((e.x - PAD) / slot.value - 0.5, 0, n - 1);
          pos.set(frac);
          const h = Math.round(frac);
          if (h !== lastHover.value) {
            lastHover.set(h);
            runOnJS(tick)();
          }
        })
        .onFinalize(() => {
          if (dragging.value === 0) return;
          dragging.set(0);
          pressed.set(withTiming(0, { duration: 160 }));
          const i = Math.round(pos.value);
          pos.set(withSpring(i, { damping: 20, stiffness: 260, mass: 0.7 }));
          runOnJS(select)(i);
        });
    // a quick sideways swipe, or a press-and-hold that then slides — whichever comes first
    const swipe = build(Gesture.Pan().activeOffsetX([-9, 9]).failOffsetY([-22, 22]));
    const hold = build(Gesture.Pan().activateAfterLongPress(230));
    return Gesture.Race(swipe, hold);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, activeIndex, routes]);

  const pillStyle = useAnimatedStyle(() => ({
    width: pillW.value,
    height: interpolate(minimized.value, [0, 1], [DOCK_FULL, DOCK_MIN]),
    transform: [{ scale: 1 + pressed.value * 0.015 }],
  }));
  const indicator = useAnimatedStyle(() => ({
    width: slot.value,
    height: interpolate(minimized.value, [0, 1], [ITEM_FULL, ITEM_MIN]),
    transform: [{ translateX: pos.value * slot.value }, { scale: 1 + pressed.value * 0.07 }],
  }));

  const step = (dir: -1 | 1) => {
    const i = Math.max(0, Math.min(n - 1, activeIndex + dir));
    if (i !== activeIndex) select(i);
  };

  return (
    <View style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 12) }} pointerEvents="box-none" onLayout={(e) => cw.set(e.nativeEvent.layout.width)}>
      <Animated.View style={[{ alignSelf: "flex-start", opacity: mounted ? 1 : 0 }, pillStyle, shadow.soft]}>
        <GlassSurface radiusSize="pill" style={{ flex: 1 }}>
          <GestureDetector gesture={pan}>
            <View
              style={{ flex: 1, flexDirection: "row", padding: PAD, alignItems: "center" }}
              accessibilityRole="tablist"
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
            >
              <Animated.View pointerEvents="none" style={[{ position: "absolute", left: PAD, borderRadius: radius.pill, backgroundColor: withAlpha(colors.textPrimary, 0.09) }, indicator]} />
              {routes.map((r, i) => (
                <TabItem
                  key={r.key}
                  meta={TABS[r.name]}
                  index={i}
                  active={i === activeIndex}
                  pos={pos}
                  minimized={minimized}
                  onKey={step}
                  onPress={() => {
                    if (i === activeIndex) expand();
                    else navigateToTab(r.key);
                  }}
                />
              ))}
            </View>
          </GestureDetector>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}
