/**
 * App tour — a spotlight walkthrough.
 *
 *  • <TourTarget id> marks a real element; the tour measures it on demand, so it
 *    follows the element wherever layout puts it and skips it if it isn't there.
 *  • A dimmed overlay with an animated rounded cut-out frames the element; the
 *    card goes on whichever side has room and never covers the element.
 *  • Everything is optional: Skip is always visible, Escape/back also skip,
 *    and the choice (done or skipped) is remembered per user, so it never
 *    restarts on login. Replay lives in the account menu and Settings.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, BackHandler, Platform, Pressable, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Defs, Mask, Rect } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-provider";
import { readRaw, writeJSON } from "@/lib/storage";
import { motion } from "@/lib/motion";
import { EASE_LUXURY } from "@/lib/ease";
import { colors, fonts, radius, shadow } from "@/theme/tokens";
import { withAlpha } from "@/lib/color";
import { Button } from "@/components/ui/controls";
import { KaiOrb } from "@/components/ui/kai-orb";
import { toast } from "@/components/ui/toast";
import { Text } from "@/components/ui/text";
import { DOCK_FULL, dockBottom } from "@/components/dock-metrics";
import { TOUR_STEPS, type TourStep } from "./steps";

type Box = { x: number; y: number; w: number; h: number };
type Entry = { ref: React.RefObject<React.ComponentRef<typeof View> | null>; scrollBy?: (dy: number) => void };
type Phase = "idle" | "welcome" | "running";

const Ctx = createContext<{ start: () => void; active: boolean; register: (id: string, e: Entry) => () => void }>({ start: () => {}, active: false, register: () => () => {} });
export const useTour = () => useContext(Ctx);

/** A scrolling screen offers this so the tour can bring off-screen targets into view. */
export const TourScrollCtx = createContext<((dy: number) => void) | undefined>(undefined);

export function TourTarget({ id, children, style }: { id: string; children: ReactNode; style?: object }) {
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const scrollBy = useContext(TourScrollCtx);
  const { register } = useTour();
  useEffect(() => register(id, { ref, scrollBy }), [id, register, scrollBy]);
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}

const key = (uid: string) => `tour.v1.${uid}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const AnimatedRect = Animated.createAnimatedComponent(Rect);

export function TourProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const targets = useRef(new Map<string, Entry>());
  const [phase, setPhase] = useState<Phase>("idle");
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Box | null>(null);
  const run = useRef(0); // cancels stale step transitions
  const decided = useRef<string | null>(null);

  const register = useCallback((id: string, e: Entry) => {
    targets.current.set(id, e);
    return () => {
      if (targets.current.get(id) === e) targets.current.delete(id);
    };
  }, []);

  const uid = user?.id;
  const ready = status === "authed" && !!user?.onboardingCompletedAt && !!uid;

  // first visit: offer the tour once, from Home, after the screen has settled
  useEffect(() => {
    if (!ready || !uid || decided.current === uid) return;
    if (!pathname.includes("dashboard")) return;
    let live = true;
    void readRaw<string>(key(uid)).then(async (v) => {
      if (!live) return;
      decided.current = uid;
      if (v) return;
      await wait(1400);
      if (live) setPhase((p) => (p === "idle" ? "welcome" : p));
    });
    return () => {
      live = false;
    };
  }, [ready, uid, pathname]);

  const finishWith = useCallback((how: "done" | "skipped") => {
    run.current++;
    setPhase("idle");
    setRect(null);
    if (uid) writeJSON(key(uid), how);
    toast.info("Tour closed. You can replay it anytime from your account menu or Settings.");
    if (how === "done") router.navigate("/dashboard");
  }, [uid, router]);

  const measure = useCallback(async (step: TourStep): Promise<Box | null> => {
    const read = () =>
      new Promise<Box | null>((res) => {
        const node = targets.current.get(step.target)?.ref.current;
        if (!node) return res(null);
        node.measureInWindow((x, y, w, h) => res(w > 0 && h > 0 && Number.isFinite(x) ? { x, y, w, h } : null));
      });
    let r: Box | null = null;
    for (let i = 0; i < 25 && !r; i++) {
      r = await read();
      if (!r) await wait(120);
    }
    if (!r || step.pinned) return r;
    // bring it into the clear band between the status bar and the tab bar
    const top = insets.top + 16;
    const bottom = H - (dockBottom(insets.bottom) + DOCK_FULL + 24);
    const entry = targets.current.get(step.target);
    let dy = 0;
    if (r.y < top) dy = r.y - top;
    else if (r.y + r.h > bottom) dy = Math.min(r.y + r.h - bottom, r.y - top);
    if (dy && entry?.scrollBy) {
      entry.scrollBy(dy);
      await wait(520);
      r = (await read()) ?? r;
    }
    return r;
  }, [H, insets.top, insets.bottom]);

  const go = useCallback(async (i: number, dir: 1 | -1) => {
    const token = ++run.current;
    let n = i;
    while (n >= 0 && n < TOUR_STEPS.length) {
      const step = TOUR_STEPS[n];
      router.navigate(step.route);
      await wait(380);
      if (run.current !== token) return;
      const r = await measure(step);
      if (run.current !== token) return;
      if (r) {
        setIndex(n);
        setRect(r);
        return;
      }
      n += dir; // target isn't on screen right now — skip it rather than point at nothing
    }
    if (dir === 1) finishWith("done");
  }, [router, measure, finishWith]);

  const begin = useCallback(() => {
    setPhase("running");
    void go(0, 1);
  }, [go]);

  const next = () => (index >= TOUR_STEPS.length - 1 ? finishWith("done") : void go(index + 1, 1));
  const back = () => index > 0 && void go(index - 1, -1);
  const skip = () => finishWith("skipped");

  const start = useCallback(() => {
    run.current++;
    setIndex(0);
    setRect(null);
    router.navigate("/dashboard");
    setPhase("welcome");
  }, [router]);

  // keep the spotlight on its element if the window changes size
  useEffect(() => {
    if (phase !== "running") return;
    const step = TOUR_STEPS[index];
    let live = true;
    void measure(step).then((r) => live && r && setRect(r));
    return () => {
      live = false;
    };
  }, [W, H, phase, index, measure]);

  // hardware back and keyboard
  useEffect(() => {
    if (phase === "idle") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      skip();
      return true;
    });
    let onKey: ((e: KeyboardEvent) => void) | null = null;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      onKey = (e) => {
        if (e.key === "Escape") skip();
        else if (phase === "running" && (e.key === "ArrowRight" || e.key === "Enter")) next();
        else if (phase === "running" && e.key === "ArrowLeft") back();
        else if (phase === "welcome" && e.key === "Enter") begin();
      };
      window.addEventListener("keydown", onKey);
    }
    return () => {
      sub.remove();
      if (onKey) window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  const value = useMemo(() => ({ start, active: phase !== "idle", register }), [start, phase, register]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {phase === "welcome" ? <Welcome onStart={begin} onSkip={skip} /> : null}
      {phase === "running" && rect ? <Spotlight step={TOUR_STEPS[index]} index={index} rect={rect} W={W} H={H} insets={insets} onNext={next} onBack={back} onSkip={skip} /> : null}
    </Ctx.Provider>
  );
}

const SCRIM = "rgba(8,3,9,0.74)";

function Welcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const o = useSharedValue(motion.reduced ? 1 : 0);
  useEffect(() => {
    o.set(withTiming(1, { duration: motion.reduced ? 0 : 360, easing: EASE_LUXURY }));
    AccessibilityInfo.announceForAccessibility?.("Welcome to Forma. Take a short tour, or skip it.");
  }, [o]);
  const fade = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ translateY: (1 - o.get()) * 14 }] }));
  const bullets: [keyof typeof Ionicons.glyphMap, string][] = [
    ["compass-outline", "See where the important tools live"],
    ["hand-left-outline", "Go at your own pace, back or forward"],
    ["refresh-outline", "Skip now, replay anytime from Settings"],
  ];
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM, alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1000 }]} accessibilityViewIsModal>
      <Animated.View accessibilityRole="alert" style={[{ width: "100%", maxWidth: 380, borderRadius: radius.large, padding: 24, gap: 16, backgroundColor: colors.surfaceOpaque, borderWidth: 1, borderColor: colors.lineSoft, alignItems: "center" }, shadow.float, fade]}>
        <KaiOrb size={64} />
        <View style={{ gap: 6, alignItems: "center" }}>
          <Text variant="title" style={{ textAlign: "center" }}>Welcome to Forma</Text>
          <Text color="secondary" style={{ textAlign: "center" }}>A 1-minute tour of the main features: your workout, quick logging, nutrition and Kai.</Text>
        </View>
        <View style={{ alignSelf: "stretch", gap: 10 }}>
          {bullets.map(([icon, t]) => (
            <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name={icon} size={20} color={colors.pinkSoft} />
              <Text color="secondary" style={{ flex: 1 }}>{t}</Text>
            </View>
          ))}
        </View>
        <View style={{ alignSelf: "stretch", gap: 4 }}>
          <Button label="Start the tour" onPress={onStart} />
          <Button label="Skip for now" variant="text" onPress={onSkip} />
        </View>
      </Animated.View>
    </View>
  );
}

function Spotlight({ step, index, rect, W, H, insets, onNext, onBack, onSkip }: { step: TourStep; index: number; rect: Box; W: number; H: number; insets: { top: number; bottom: number }; onNext: () => void; onBack: () => void; onSkip: () => void }) {
  const PAD = 8;
  const target = { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + PAD * 2, h: rect.h + PAD * 2 };
  const r = Math.min(target.h / 2, rect.h > 120 ? 28 : 22);
  const sx = useSharedValue(target.x);
  const sy = useSharedValue(target.y);
  const sw = useSharedValue(target.w);
  const sh = useSharedValue(target.h);
  const o = useSharedValue(0);
  const dur = motion.reduced ? 0 : 380;
  useEffect(() => {
    const cfg = { duration: dur, easing: EASE_LUXURY };
    sx.set(withTiming(target.x, cfg));
    sy.set(withTiming(target.y, cfg));
    sw.set(withTiming(target.w, cfg));
    sh.set(withTiming(target.h, cfg));
    o.set(0);
    o.set(withTiming(1, { duration: motion.reduced ? 0 : 320, easing: EASE_LUXURY }));
    AccessibilityInfo.announceForAccessibility?.(`Step ${index + 1} of ${TOUR_STEPS.length}. ${step.title}. ${step.body}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect.x, rect.y, rect.w, rect.h, index]);
  const cut = useAnimatedProps(() => ({ x: sx.get(), y: sy.get(), width: sw.get(), height: sh.get() }));
  const ring = useAnimatedProps(() => ({ x: sx.get(), y: sy.get(), width: sw.get(), height: sh.get() }));
  const cardIn = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ translateY: (1 - o.get()) * 10 }] }));

  // card goes where there's room, never over the element
  const [cardH, setCardH] = useState(210);
  const cardW = Math.min(W - 32, 360);
  const left = Math.max(16, Math.min(W - cardW - 16, rect.x + rect.w / 2 - cardW / 2));
  const GAP = 14;
  const below = H - (target.y + target.h) - insets.bottom;
  const above = target.y - insets.top;
  const placeBelow = below >= cardH + GAP || below >= above;
  const top = placeBelow ? Math.min(H - cardH - 12 - insets.bottom, target.y + target.h + GAP) : Math.max(insets.top + 8, target.y - cardH - GAP);
  const last = index === TOUR_STEPS.length - 1;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} accessibilityViewIsModal pointerEvents="box-none">
      {/* swallows taps so the app underneath can't be triggered mid-tour */}
      <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={() => {}}>
        <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Mask id="tour-cut">
              <Rect x={0} y={0} width={W} height={H} fill="#fff" />
              <AnimatedRect animatedProps={cut} rx={r} ry={r} fill="#000" />
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill={SCRIM} mask="url(#tour-cut)" />
          <AnimatedRect animatedProps={ring} rx={r} ry={r} fill="none" stroke={withAlpha(colors.pinkSoft, 0.85)} strokeWidth={2} />
        </Svg>
      </Pressable>

      <Animated.View
        onLayout={(e: LayoutChangeEvent) => setCardH(e.nativeEvent.layout.height)}
        accessibilityRole="alert"
        style={[{ position: "absolute", left, top, width: cardW, borderRadius: radius.large, padding: 18, gap: 12, backgroundColor: colors.surfaceOpaque, borderWidth: 1, borderColor: colors.lineSoft }, shadow.float, cardIn]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="meta" color="secondary" accessibilityLiveRegion="polite">Step {index + 1} of {TOUR_STEPS.length}</Text>
          <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button" accessibilityLabel="Skip tour" style={{ minHeight: 44, justifyContent: "center", marginRight: -6, paddingHorizontal: 6 }}>
            <Text variant="meta" color="secondary">Skip tour</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: 4, marginTop: -8 }} accessibilityElementsHidden>
          {TOUR_STEPS.map((s, i) => <View key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= index ? colors.pink : withAlpha(colors.textPrimary, 0.14) }} />)}
        </View>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(colors.pink, 0.16) }}>
            <Ionicons name={step.icon} size={20} color={colors.pinkSoft} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 18 }}>{step.title}</Text>
            <Text color="secondary">{step.body}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          {index > 0 ? <Button label="Back" variant="text" size="sm" onPress={() => { Haptics.selectionAsync().catch(() => {}); onBack(); }} /> : <View />}
          <View style={{ minWidth: 120 }}>
            <Button label={last ? "Finish" : "Next"} size="sm" onPress={() => { Haptics.selectionAsync().catch(() => {}); onNext(); }} />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
