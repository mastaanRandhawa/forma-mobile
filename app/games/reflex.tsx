/**
 * Reflex — wait for the pad to turn green, then tap. Five clean rounds; a tap
 * before green is a false start and that round is re-run. Score is the
 * average reaction time in milliseconds (lower is better).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { GameIntro, GameResult } from "@/components/games";
import { Screen } from "@/components/ui/screen";
import { PageHeader } from "@/components/ui/extra";
import { Label, Num, Text } from "@/components/ui/text";

const ROUNDS = 5;
type Phase = "intro" | "ready" | "wait" | "go" | "hit" | "early" | "done";

export default function Reflex() {
  useTheme();
  const [phase, setPhase] = useState<Phase>("intro");
  const [times, setTimes] = useState<number[]>([]);
  const [falseStarts, setFalseStarts] = useState(0);
  const goAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const arm = useCallback(() => {
    clear();
    setPhase("wait");
    timer.current = setTimeout(() => {
      goAt.current = performance.now();
      setPhase("go");
    }, 1400 + Math.random() * 2600);
  }, []);

  const start = () => {
    setTimes([]);
    setFalseStarts(0);
    setPhase("ready");
  };

  const tap = () => {
    if (phase === "ready" || phase === "hit" || phase === "early") {
      arm();
    } else if (phase === "wait") {
      clear();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setFalseStarts((n) => n + 1);
      setPhase("early");
    } else if (phase === "go") {
      const ms = Math.round(performance.now() - goAt.current);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const next = [...times, ms];
      setTimes(next);
      setPhase(next.length >= ROUNDS ? "done" : "hit");
    }
  };

  const avg = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
  const last = times[times.length - 1];

  const pad: Record<"ready" | "wait" | "go" | "hit" | "early", { bg: string; title: string; sub: string; ink: string }> = {
    ready: { bg: colors.surfaceRaised, title: "Tap to begin", sub: `Round 1 of ${ROUNDS}`, ink: colors.textPrimary },
    wait: { bg: "#7A1F2B", title: "Wait for green…", sub: "Don't jump the gun", ink: "#fff" },
    go: { bg: "#3FBF5A", title: "TAP!", sub: "", ink: "#0B2410" },
    hit: { bg: colors.surfaceRaised, title: `${last ?? 0} ms`, sub: `Tap for round ${times.length + 1} of ${ROUNDS}`, ink: colors.textPrimary },
    early: { bg: colors.surfaceRaised, title: "False start", sub: "Too soon — tap to retry this round", ink: colors.coral },
  };

  return (
    <Screen reveal={false} scroll={false}>
      <PageHeader title="Reflex" />
      {phase === "intro" ? (
        <GameIntro id="reflex" onStart={start} />
      ) : phase === "done" ? (
        <GameResult id="reflex" score={avg} detail={`Rounds: ${times.join(" · ")} ms${falseStarts ? ` · ${falseStarts} false start${falseStarts > 1 ? "s" : ""}` : ""}`} onAgain={start} />
      ) : (
        <View style={{ flex: 1, gap: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Label>ROUND</Label>
              <Num size={24}>{Math.min(times.length + 1, ROUNDS)}/{ROUNDS}</Num>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Label>AVERAGE</Label>
              <Num size={24}>{times.length ? `${avg} ms` : "—"}</Num>
            </View>
          </View>
          <Pressable
            onPressIn={tap}
            accessibilityRole="button"
            accessibilityLabel={pad[phase].title}
            style={{ flex: 1, borderRadius: radius.large, backgroundColor: pad[phase].bg, alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}
          >
            <Text variant="display" style={{ color: pad[phase].ink, textAlign: "center" }}>{pad[phase].title}</Text>
            {pad[phase].sub ? <Text style={{ color: pad[phase].ink, opacity: 0.75 }}>{pad[phase].sub}</Text> : null}
          </Pressable>
        </View>
      )}
    </Screen>
  );
}
