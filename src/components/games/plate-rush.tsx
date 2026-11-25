/**
 * Plate Rush — load the bar to the target weight. Tap a plate to add a pair;
 * tap a loaded plate to strip it and everything outside it. 40 seconds, so a
 * run fits inside one rest; every solved bar scores one.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/auth/auth-provider";
import { shuffle } from "@/lib/games";
import { useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { ProgressBar } from "@/components/ui/controls";
import { PressScale } from "@/components/ui/pressable";
import { SoftSurface } from "@/components/ui/surface";
import { Label, Num, Text } from "@/components/ui/text";
import type { GameProps } from "./host";

const DURATION = 40_000;

const SETS = {
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
} as const;

/** A solvable target that gets harder as you score: more plates per side. */
function makeTarget(unit: "kg" | "lb", level: number, prev?: number): number {
  const { bar, plates } = SETS[unit];
  const max = Math.min(5, 2 + Math.floor(level / 2));
  for (;;) {
    const n = 1 + Math.floor(Math.random() * max);
    const total = bar + shuffle(plates).slice(0, n).reduce((s, p) => s + p, 0) * 2;
    if (total !== prev) return total;
  }
}

export function PlateRush({ onDone }: GameProps) {
  useTheme();
  const { user } = useAuth();
  const unit: "kg" | "lb" = user?.unitPreference === "metric" ? "kg" : "lb";
  const { bar, plates } = SETS[unit];
  const [target, setTarget] = useState(() => makeTarget(unit, 0));
  const [side, setSide] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(DURATION);
  const deadline = useRef(0);
  const scoreRef = useRef(0);
  const finished = useRef(false);

  useEffect(() => {
    if (!deadline.current) deadline.current = Date.now() + DURATION;
    const t = setInterval(() => {
      const ms = Math.max(0, deadline.current - Date.now());
      setLeft(ms);
      if (ms === 0 && !finished.current) {
        finished.current = true;
        const s = scoreRef.current;
        onDone(s, `${s} ${s === 1 ? "bar" : "bars"} loaded in ${DURATION / 1000} seconds.`);
      }
    }, 100);
    return () => clearInterval(t);
  }, [onDone]);

  const loaded = bar + side.reduce((s, p) => s + p, 0) * 2;
  const over = loaded > target;

  // solved → score and roll the next (slightly harder) bar
  useEffect(() => {
    if (loaded !== target) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const t = setTimeout(() => {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      setSide([]);
      setTarget((prev) => makeTarget(unit, scoreRef.current, prev));
    }, 200);
    return () => clearTimeout(t);
  }, [loaded, target, unit]);

  const add = (p: number) => side.length < 8 && setSide((s) => [...s, p]);
  const strip = (i: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSide((s) => s.slice(0, i));
  };
  const maxPlate = plates[0];
  const low = left < 10_000;

  return (
    <View style={{ flex: 1, gap: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View>
          <Label>BARS</Label>
          <Num size={28}>{score}</Num>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Label>TIME</Label>
          <Num size={28} style={{ color: low ? colors.coral : colors.textPrimary }}>{Math.ceil(left / 1000)}</Num>
        </View>
      </View>
      <ProgressBar pct={(left / DURATION) * 100} tone={low ? "amber" : "cyan"} height={5} />

      <SoftSurface style={{ flex: 1, padding: 18, gap: 12, alignItems: "center", justifyContent: "center" }}>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Label>TARGET</Label>
          <Num size={48} style={{ color: colors.lime }}>{target}</Num>
          <Text variant="meta" color={over ? "danger" : "tertiary"}>
            Loaded {loaded} {unit}{over ? " · too heavy, tap a plate to strip it" : ""}
          </Text>
        </View>

        {/* one side of the bar: collar + plates (tap to strip) + sleeve */}
        <View style={{ flexDirection: "row", alignItems: "center", height: 120, alignSelf: "stretch", justifyContent: "center" }}>
          <View style={{ width: 14, height: 34, borderRadius: 4, backgroundColor: colors.textTertiary }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginLeft: 3 }}>
            {side.map((p, i) => (
              <Pressable key={i} onPress={() => strip(i)} accessibilityRole="button" accessibilityLabel={`Strip ${p} ${unit} plate`} hitSlop={4}>
                <View style={{ width: 16, height: 40 + (p / maxPlate) * 76, borderRadius: 5, backgroundColor: plateColor(p, unit), borderWidth: 1, borderColor: colors.hairline }} />
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1, maxWidth: 120, height: 10, borderTopRightRadius: 5, borderBottomRightRadius: 5, backgroundColor: colors.textTertiary }} />
        </View>
        <Text variant="meta" color="tertiary">Per side: {side.length ? side.join(" · ") : "empty"} · {bar} {unit} bar</Text>
      </SoftSurface>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {plates.map((p) => (
          <PressScale key={p} onPress={() => add(p)} haptic="light" accessibilityLabel={`Add a pair of ${p} ${unit} plates`}
            style={{ flexBasis: "22%", flexGrow: 1, aspectRatio: 1.25, maxHeight: 84, borderRadius: radius.small, alignItems: "center", justifyContent: "center", backgroundColor: plateColor(p, unit) }}>
            <Num size={22} style={{ color: "#fff" }}>{p}</Num>
          </PressScale>
        ))}
      </View>
    </View>
  );
}

/** Competition-style plate colours, so plates read at a glance. */
function plateColor(p: number, unit: "kg" | "lb"): string {
  const kg = unit === "kg" ? p : p / 2.2;
  if (kg >= 24) return "#C8323C";
  if (kg >= 19) return "#2F5FD0";
  if (kg >= 14) return "#C9A227";
  if (kg >= 9) return "#2E9E5B";
  if (kg >= 4) return "#6B6F7A";
  return "#3A3D45";
}
