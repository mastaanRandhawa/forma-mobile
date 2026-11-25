/**
 * Reflex — wait for the pad to turn green, then tap. Five clean rounds; a tap
 * before green is a false start and that round is re-run. Score is the
 * average reaction time in milliseconds (lower is better). ~20 seconds.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { Label, Num, Text } from "@/components/ui/text";
import type { GameProps } from "./host";

const ROUNDS = 5;
type Phase = "ready" | "wait" | "go" | "hit" | "early";

export function Reflex({ onDone }: GameProps) {
  useTheme();
  const [phase, setPhase] = useState<Phase>("ready");
  const [times, setTimes] = useState<number[]>([]);
  const [falseStarts, setFalseStarts] = useState(0);
  const goAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const arm = () => {
    clear();
    setPhase("wait");
    timer.current = setTimeout(() => {
      goAt.current = performance.now();
      setPhase("go");
    }, 1200 + Math.random() * 2300);
  };

  const tap = () => {
    if (phase === "ready" || phase === "hit" || phase === "early") return arm();
    if (phase === "wait") {
      clear();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setFalseStarts((n) => n + 1);
      return setPhase("early");
    }
    const ms = Math.round(performance.now() - goAt.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const next = [...times, ms];
    setTimes(next);
    if (next.length < ROUNDS) return setPhase("hit");
    const avg = Math.round(next.reduce((s, t) => s + t, 0) / next.length);
    onDone(avg, `Rounds: ${next.join(" · ")} ms${falseStarts ? ` · ${falseStarts} false start${falseStarts > 1 ? "s" : ""}` : ""}`);
  };

  const avg = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
  const last = times[times.length - 1];
  const pad: Record<Phase, { bg: string; title: string; sub: string; ink: string }> = {
    ready: { bg: colors.surfaceRaised, title: "Tap to begin", sub: `Round 1 of ${ROUNDS}`, ink: colors.textPrimary },
    wait: { bg: "#7A1F2B", title: "Wait for green…", sub: "Don't jump the gun", ink: "#fff" },
    go: { bg: "#3FBF5A", title: "TAP!", sub: "", ink: "#0B2410" },
    hit: { bg: colors.surfaceRaised, title: `${last ?? 0} ms`, sub: `Tap for round ${times.length + 1} of ${ROUNDS}`, ink: colors.textPrimary },
    early: { bg: colors.surfaceRaised, title: "False start", sub: "Too soon — tap to retry this round", ink: colors.coral },
  };

  return (
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
        style={{ flex: 1, minHeight: 260, borderRadius: radius.large, backgroundColor: pad[phase].bg, alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        <Text variant="display" style={{ color: pad[phase].ink, textAlign: "center" }}>{pad[phase].title}</Text>
        {pad[phase].sub ? <Text style={{ color: pad[phase].ink, opacity: 0.75 }}>{pad[phase].sub}</Text> : null}
      </Pressable>
    </View>
  );
}
