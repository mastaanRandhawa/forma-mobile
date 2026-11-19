/**
 * Kai — ported from the website's SmoothUI `AIOrbFace` + `KaiOrb`.
 *
 * Same character, same proportions (100×100 viewBox): a round body with an
 * off-centre radial gradient and one soft highlight, two upright pill eyes
 * (11×26, r 5.5), and a short line mouth. Expressions are drawn, not swapped
 * for icons:
 *   idle / streaming — open eyes, blinking (single + occasional double)
 *   listening        — eyes widen
 *   thinking         — eyes narrow, saccade around, mouth wiggles
 *   done             — happy arcs + smile, body bounces once
 *   error            — spiral eyes, wavy mouth, body shakes, colour drains
 * Colours come from the equipped "look" (authored in oklch on the web).
 */
import { memo, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import type { Dashboard } from "@/api/types";
import { mix, normalizeColor, parseColor, toHex } from "@/lib/color";
import { motion } from "@/lib/motion";
import { EASE_LUXURY } from "@/lib/ease";
import { useEquippedItem } from "@/theme/theme-provider";
import { Fill } from "./gradient";

export type AIState = "idle" | "listening" | "thinking" | "streaming" | "done" | "error";
type StateInput = AIState | "happy" | "rest";

type Look = { body: string; bodyEdge: string; feature: string; glow: string };

const L = (body: string, bodyEdge: string, feature: string, glow: string): Look => ({ body: normalizeColor(body), bodyEdge: normalizeColor(bodyEdge), feature: normalizeColor(feature), glow });

/** Per-look face palette — identical values to the website's `LOOKS`. */
export const LOOKS: Record<string, Look> = {
  "l-signature": L("oklch(77% 0.17 349)", "oklch(56% 0.19 6)", "oklch(23% 0.05 330)", "rgba(240,108,176,0.45)"),
  "l-aurora": L("oklch(80% 0.13 320)", "oklch(64% 0.15 230)", "oklch(24% 0.05 300)", "rgba(131,233,244,0.42)"),
  "l-ember": L("oklch(80% 0.15 45)", "oklch(60% 0.18 28)", "oklch(24% 0.05 40)", "rgba(255,140,90,0.44)"),
  "l-frost": L("oklch(87% 0.07 235)", "oklch(66% 0.13 245)", "oklch(28% 0.04 250)", "rgba(120,199,255,0.4)"),
  "l-nebula": L("oklch(72% 0.16 300)", "oklch(48% 0.18 330)", "oklch(22% 0.05 310)", "rgba(156,123,255,0.42)"),
  "l-jade": L("oklch(80% 0.14 165)", "oklch(55% 0.13 168)", "oklch(23% 0.05 170)", "rgba(79,214,166,0.4)"),
  "l-mono": L("oklch(84% 0.008 260)", "oklch(52% 0.015 260)", "oklch(26% 0.01 260)", "rgba(200,200,210,0.34)"),
  "l-gold": L("oklch(86% 0.12 92)", "oklch(62% 0.13 74)", "oklch(26% 0.05 80)", "rgba(245,198,60,0.4)"),
  "l-holo": L("oklch(82% 0.13 320)", "oklch(68% 0.16 200)", "oklch(24% 0.05 300)", "rgba(180,150,255,0.42)"),
};
export const DEFAULT_LOOK = "l-signature";
export const kaiLook = (id?: string): Look => LOOKS[id ?? ""] ?? LOOKS[DEFAULT_LOOK];

/** Kai's expression from how the week is going (same rule as the website). */
export function coachMood(d: Dashboard | null | undefined): AIState {
  if (!d) return "done";
  const pace = d.weeklyRing.target ? d.weeklyRing.done / d.weeklyRing.target : 1;
  return pace < 0.4 || d.readiness < 55 || d.streakDays === 0 ? "thinking" : "done";
}

const C = 50;
const EYE_OFFSET = 16;
const EYE_Y = 44;
const EYE_W = 11;
const EYE_H = 26;
const EYE_R = 5.5;
const GAZE_RANGE = 5.5;
const SACCADES = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -0.6, y: -0.4 },
  { x: 0.8, y: -0.9 },
];
const SPIRAL = "M0 0C-0.6 -4 5 -5 6 -0.6C7 4.5 1 8 -4 6C-9 4.5 -9.5 -2 -6 -6";

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Drain colour toward its own grey (the web's `saturate(0.3)` on error). */
const desaturate = (c: string, amount: number) => {
  const [r, g, b] = parseColor(c);
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return toHex(parseColor(mix(c, `rgb(${y},${y},${y})`, amount)));
};

function Eye({ side, open, lid, gx, gy, color }: { side: -1 | 1; open: number; lid: { value: number }; gx: { value: number }; gy: { value: number }; color: string }) {
  const props = useAnimatedProps(() => {
    const h = Math.max(1, EYE_H * open * lid.value);
    return {
      x: C + side * EYE_OFFSET - EYE_W / 2 + gx.value,
      y: EYE_Y + (EYE_H - h) / 2 + gy.value,
      height: h,
      rx: Math.min(EYE_R, h / 2),
    };
  });
  return <AnimatedRect width={EYE_W} fill={color} animatedProps={props} />;
}

function HappyEye({ side, color, draw }: { side: -1 | 1; color: string; draw: { value: number } }) {
  const cx = C + side * EYE_OFFSET;
  const y = EYE_Y + EYE_H / 2;
  const LEN = 24;
  const props = useAnimatedProps(() => ({ strokeDashoffset: LEN * (1 - draw.value) }));
  return <AnimatedPath d={`M${cx - 8} ${y + 3} Q${cx} ${y - 11} ${cx + 8} ${y + 3}`} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${LEN} ${LEN}`} animatedProps={props} />;
}

function DizzyEye({ side, color }: { side: -1 | 1; color: string }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    if (motion.reduced) return;
    rot.value = withRepeat(withTiming(360 * side, { duration: 2400, easing: Easing.linear }), -1);
    return () => cancelAnimation(rot);
  }, [rot, side]);
  const props = useAnimatedProps(() => ({ transform: [{ translateX: C + side * EYE_OFFSET }, { translateY: EYE_Y + EYE_H / 2 }, { rotate: `${rot.value}deg` }, { scale: 1.5 }] }));
  return (
    <AnimatedG animatedProps={props as never}>
      <Path d={SPIRAL} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </AnimatedG>
  );
}

function Orb({ size = 40, state: stateIn = "done", look, breathe = true, label }: { size?: number; state?: StateInput; look?: string; breathe?: boolean; label?: string }) {
  const state: AIState = stateIn === "happy" ? "done" : stateIn === "rest" ? "idle" : stateIn;
  const equipped = useEquippedItem("avatar")?.id;
  const c0 = kaiLook(look ?? equipped);
  const broken = state === "error";
  const colors = useMemo(
    () => ({ body: broken ? desaturate(c0.body, 0.7) : c0.body, edge: broken ? desaturate(c0.bodyEdge, 0.7) : c0.bodyEdge, feature: c0.feature, glow: c0.glow }),
    [c0, broken],
  );

  const happy = state === "done";
  const thinking = state === "thinking";
  const listening = state === "listening";
  const eyesOpen = !(happy || broken);
  const open = listening ? 1.15 : thinking ? 0.62 : state === "streaming" ? 0.88 : 1;

  const lid = useSharedValue(1);
  const gx = useSharedValue(0);
  const gy = useSharedValue(0);
  const draw = useSharedValue(motion.reduced ? 1 : 0);
  const mouthX = useSharedValue(0);
  const body = useSharedValue(0); // drives bounce / shake timelines
  const breath = useSharedValue(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // ambient breathing (kai-breathe 3.2s) or the busier thinking pulse (kai-think 1.8s)
  useEffect(() => {
    if (!breathe || motion.reduced) {
      breath.value = 0;
      return;
    }
    const dur = thinking ? 900 : 1600;
    breath.value = withRepeat(withSequence(withTiming(1, { duration: dur, easing: EASE_LUXURY }), withTiming(0, { duration: dur, easing: EASE_LUXURY })), -1);
    return () => cancelAnimation(breath);
  }, [breathe, thinking, breath]);

  // blinking: every 3.2–5.8s, a quarter of them double
  useEffect(() => {
    if (motion.reduced || !eyesOpen) {
      lid.value = 1;
      return;
    }
    let t: ReturnType<typeof setTimeout>;
    const once = (double: boolean) => {
      const seq = [withTiming(0.08, { duration: 70, easing: Easing.in(Easing.cubic) }), withTiming(1, { duration: double ? 70 : 160, easing: Easing.out(Easing.cubic) })];
      lid.value = withSequence(...seq);
      if (double) setTimeout(() => alive.current && (lid.value = withSequence(withTiming(0.08, { duration: 70 }), withTiming(1, { duration: 160 }))), 150);
    };
    const schedule = () => {
      t = setTimeout(() => {
        if (alive.current) once(Math.random() < 0.25);
        schedule();
      }, 3200 + Math.random() * 2600);
    };
    schedule();
    return () => clearTimeout(t);
  }, [eyesOpen, lid]);

  // thinking: eyes dart between a few points, mouth drifts
  useEffect(() => {
    if (!thinking || motion.reduced) {
      gx.value = withSpring(0, { damping: 26, stiffness: 220 });
      gy.value = withSpring(0, { damping: 26, stiffness: 220 });
      mouthX.value = 0;
      return;
    }
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      const target = SACCADES[i++ % SACCADES.length];
      gx.value = withSpring(target.x * GAZE_RANGE, { damping: 26, stiffness: 220 });
      gy.value = withSpring(target.y * GAZE_RANGE, { damping: 26, stiffness: 220 });
      t = setTimeout(step, 700 + Math.random() * 700);
    };
    step();
    mouthX.value = withRepeat(withSequence(withTiming(3, { duration: 1200, easing: EASE_LUXURY }), withTiming(0, { duration: 1200, easing: EASE_LUXURY })), -1);
    return () => {
      clearTimeout(t);
      cancelAnimation(mouthX);
    };
  }, [thinking, gx, gy, mouthX]);

  // done → draw the happy arcs and bounce once; error → shake once
  useEffect(() => {
    if (happy) {
      draw.value = motion.reduced ? 1 : 0;
      if (!motion.reduced) {
        draw.value = withTiming(1, { duration: 300, easing: EASE_LUXURY });
        body.value = 0;
        body.value = withTiming(1, { duration: 850, easing: EASE_LUXURY });
      }
    } else if (broken && !motion.reduced) {
      body.value = 0;
      body.value = withTiming(1, { duration: 1050, easing: Easing.inOut(Easing.cubic) });
    } else {
      body.value = 0;
    }
  }, [happy, broken, draw, body]);

  const wrap = useAnimatedStyle(() => {
    const p = body.value;
    let sx = 1;
    let sy = 1;
    let ty = 0;
    let tx = 0;
    let rot = 0;
    if (happy && p > 0 && p < 1) {
      // squash & stretch keyframes at 0 / .12 / .4 / .62 / .82 / 1
      const k = (a: number[]) => (p < 0.12 ? a[0] + (a[1] - a[0]) * (p / 0.12) : p < 0.4 ? a[1] + (a[2] - a[1]) * ((p - 0.12) / 0.28) : p < 0.62 ? a[2] + (a[3] - a[2]) * ((p - 0.4) / 0.22) : p < 0.82 ? a[3] + (a[4] - a[3]) * ((p - 0.62) / 0.2) : a[4] + (a[5] - a[4]) * ((p - 0.82) / 0.18));
      sx = k([1, 1.08, 0.94, 1.04, 0.99, 1]);
      sy = k([1, 0.9, 1.08, 0.95, 1.02, 1]);
      ty = k([0, 3, -9, 0, -3, 0]) * (size / 100);
    }
    if (broken && p > 0 && p < 1) {
      const wob = Math.sin(p * Math.PI * 6) * (1 - p);
      rot = wob * 11;
      tx = wob * -5 * (size / 100);
    }
    const bs = 1 + breath.value * (thinking ? 0.06 : 0.045);
    return { opacity: breathe && !thinking ? 1 - breath.value * 0.08 : 1, transform: [{ translateX: tx }, { translateY: ty }, { rotate: `${rot}deg` }, { scaleX: sx * bs }, { scaleY: sy * bs }] };
  });

  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.75 + breath.value * 0.25 }));
  const wobble = useAnimatedProps(() => ({ x1: C - 6 + mouthX.value, x2: C + 8 + mouthX.value }));

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={label ?? "Kai, your trainer"}>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: -size * 0.3, top: -size * 0.3, width: size * 1.6, height: size * 1.6 }, glowStyle]}>
        <Fill radial={{ cx: 0.5, cy: 0.5, r: 0.5 }} stops={[{ color: colors.glow, at: 0 }, { color: colors.glow.replace(/[\d.]+\)$/, "0.18)"), at: 0.35 }, { color: colors.glow.replace(/[\d.]+\)$/, "0)"), at: 0.7 }]} />
      </Animated.View>
      <Animated.View style={wrap}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="kaiBody" cx="35%" cy="28%" r="80%" fx="35%" fy="28%">
              <Stop offset="0" stopColor={colors.body} />
              <Stop offset="1" stopColor={colors.edge} />
            </RadialGradient>
          </Defs>
          <Circle cx={C} cy={C} r={48} fill="url(#kaiBody)" />
          <Ellipse cx={C - 14} cy={C - 22} rx={13} ry={8} fill="#FFFFFF" fillOpacity={0.4} />
          {eyesOpen ? <Eye side={-1} open={open} lid={lid} gx={gx} gy={gy} color={colors.feature} /> : null}
          {eyesOpen ? <Eye side={1} open={open} lid={lid} gx={gx} gy={gy} color={colors.feature} /> : null}
          {happy ? <HappyEye side={-1} color={colors.feature} draw={draw} /> : null}
          {happy ? <HappyEye side={1} color={colors.feature} draw={draw} /> : null}
          {broken ? <DizzyEye side={-1} color={colors.feature} /> : null}
          {broken ? <DizzyEye side={1} color={colors.feature} /> : null}
          {happy ? (
            <Path d={`M${C - 11} 76 Q${C} 88 ${C + 11} 76`} fill="none" stroke={colors.feature} strokeWidth={5} strokeLinecap="round" />
          ) : broken ? (
            <Path d={`M${C - 12} 79 q6 -7 12 0 t12 0`} fill="none" stroke={colors.feature} strokeWidth={4} strokeLinecap="round" />
          ) : thinking ? (
            <AnimatedLine y1={78} y2={78} stroke={colors.feature} strokeWidth={4} strokeLinecap="round" animatedProps={wobble} />
          ) : (
            <Line x1={C - 7} x2={C + 7} y1={78} y2={78} stroke={colors.feature} strokeWidth={4} strokeLinecap="round" />
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}

export const KaiOrb = memo(Orb);
