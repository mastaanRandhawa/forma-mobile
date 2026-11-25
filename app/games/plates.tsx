/**
 * Plate Rush — load the bar to the target weight as fast as you can. Tap a
 * plate to add it to both sides; tap a loaded plate to strip it (and every
 * plate outside it). 60 seconds; every solved bar scores one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/auth/auth-provider";
import { shuffle } from "@/lib/games";
import { useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { GameIntro, GameResult } from "@/components/games";
import { Screen } from "@/components/ui/screen";
import { PageHeader } from "@/components/ui/extra";
import { ProgressBar } from "@/components/ui/controls";
import { PressScale } from "@/components/ui/pressable";
import { SoftSurface } from "@/components/ui/surface";
import { Label, Num, Text } from "@/components/ui/text";

const DURATION = 60_000;

const SETS = {
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
} as const;

/** A solvable target: bar plus 1–5 random plates per side. */
function makeTarget(unit: "kg" | "lb", prev?: number): number {
  const { bar, plates } = SETS[unit];
  for (;;) {
    const n = 1 + Math.floor(Math.random() * 5);
    const side = shuffle(plates).slice(0, n).reduce((s, p) => s + p, 0);
    const total = bar + side * 2;
    if (total !== prev) return total;
  }
}

export default function PlateRush() {
  useTheme();
  const { user } = useAuth();
  const unit: "kg" | "lb" = user?.unitPreference === "metric" ? "kg" : "lb";
  const { bar, plates } = SETS[unit];
  const [phase, setPhase] = useState<"intro" | "play" | "done">("intro");
  const [target, setTarget] = useState(() => makeTarget(unit));
  const [side, setSide] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(DURATION);
  const deadline = useRef(0);

  const start = useCallback(() => {
    setScore(0);
    setSide([]);
    setTarget(makeTarget(unit));
    deadline.current = Date.now() + DURATION;
    setLeft(DURATION);
    setPhase("play");
  }, [unit]);

  useEffect(() => {
    if (phase !== "play") return;
    const t = setInterval(() => {
      const ms = Math.max(0, deadline.current - Date.now());
      setLeft(ms);
      if (ms === 0) setPhase("done");
    }, 100);
    return () => clearInterval(t);
  }, [phase]);

  const loaded = bar + side.reduce((s, p) => s + p, 0) * 2;
  const over = loaded > target;

  // solved → score and roll the next bar
  useEffect(() => {
    if (phase !== "play" || loaded !== target) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const t = setTimeout(() => {
      setScore((s) => s + 1);
      setSide([]);
      setTarget((prev) => makeTarget(unit, prev));
    }, 220);
    return () => clearTimeout(t);
  }, [loaded, target, phase, unit]);

  const add = (p: number) => {
    if (side.length >= 8) return;
    setSide((s) => [...s, p]);
  };
  const strip = (i: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSide((s) => s.slice(0, i));
  };

  const maxPlate = plates[0];

  return (
    <Screen reveal={false}>
      <PageHeader title="Plate Rush" />
      {phase === "intro" ? (
        <GameIntro id="plates" onStart={start}>
          <Text variant="meta" color="tertiary" style={{ textAlign: "center" }}>
            {bar} {unit} bar · plates load on both sides · tap a loaded plate to strip it
          </Text>
        </GameIntro>
      ) : phase === "done" ? (
        <GameResult id="plates" score={score} detail={`You loaded ${score} ${score === 1 ? "bar" : "bars"} in 60 seconds.`} onAgain={start} />
      ) : (
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <View>
              <Label>SCORE</Label>
              <Num size={28}>{score}</Num>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Label>TIME</Label>
              <Num size={28} style={{ color: left < 10_000 ? colors.coral : colors.textPrimary }}>{Math.ceil(left / 1000)}</Num>
            </View>
          </View>
          <ProgressBar pct={(left / DURATION) * 100} tone={left < 10_000 ? "amber" : "lime"} height={5} />

          <SoftSurface style={{ padding: 20, gap: 18, alignItems: "center" }}>
            <View style={{ alignItems: "center", gap: 4 }}>
              <Label>TARGET</Label>
              <Num size={48} style={{ color: colors.lime }}>{target}</Num>
              <Text variant="meta" color={over ? "danger" : "tertiary"}>
                Loaded {loaded} {unit}{over ? " · too heavy, strip a plate" : ""}
              </Text>
            </View>

            {/* one side of the bar: sleeve + plates (tap to strip) */}
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
            <Text variant="meta" color="tertiary">Per side: {side.length ? side.join(" · ") : "empty"}</Text>
          </SoftSurface>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {plates.map((p) => (
              <PressScale key={p} onPress={() => add(p)} haptic="light" accessibilityLabel={`Add ${p} ${unit} plates`}
                style={{ width: 72, height: 72, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: plateColor(p, unit) }}>
                <Num size={18} style={{ color: "#fff" }}>{p}</Num>
              </PressScale>
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}

/** Competition-style plate colours, so plates read at a glance. */
function plateColor(p: number, unit: "kg" | "lb"): string {
  const kg = unit === "kg" ? p : p / 2.2;
  if (kg >= 24) return "#C8323C"; // red
  if (kg >= 19) return "#2F5FD0"; // blue
  if (kg >= 14) return "#C9A227"; // yellow
  if (kg >= 9) return "#2E9E5B"; // green
  if (kg >= 4) return "#6B6F7A"; // grey
  return "#3A3D45";
}
