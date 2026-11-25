/**
 * GameHost runs one mini-game: intro → play → result. In rest mode (opened
 * from the rest timer during a workout) it skips the intro, shows the rest
 * countdown above the game, and the moment rest ends it freezes the game and
 * sends you back to your set. A run cut off by the end of rest isn't scored.
 */
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useActiveUI } from "@/lib/active-session";
import { addRestSeconds, dailyChallenge, GAME_MAP, recordRun, useGameStats, type GameId, type PlayResult } from "@/lib/games";
import { useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { Button, ProgressBar } from "@/components/ui/controls";
import { RaisedSurface } from "@/components/ui/surface";
import { Label, Num, Text } from "@/components/ui/text";
import { PlateRush } from "./plate-rush";
import { Reflex } from "./reflex";
import { MuscleMatch } from "./muscle-match";
import { Breathe } from "./breathe";

/** A game unmounts the moment rest runs out, which stops its timers. */
export interface GameProps {
  onDone: (score: number, detail?: string) => void;
}

const PLAY: Record<GameId, ComponentType<GameProps>> = { plates: PlateRush, reflex: Reflex, muscles: MuscleMatch, breathe: Breathe };

/** Seconds of rest left for a workout session, ticking 4×/s; null when not resting. */
export function useRestLeft(sessionId: string | undefined): { left: number | null; total: number } {
  const ui = useActiveUI(sessionId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sessionId) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [sessionId]);
  if (!sessionId || !ui.restEndsAt) return { left: sessionId ? 0 : null, total: ui.restTotal };
  return { left: Math.max(0, (ui.restEndsAt - now) / 1000), total: ui.restTotal };
}

export function RestStrip({ left, total, onBack }: { left: number; total: number; onBack: () => void }) {
  useTheme();
  const low = left <= 10;
  return (
    <View style={{ gap: 8, marginBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Ionicons name="timer-outline" size={16} color={low ? colors.coral : colors.lime} />
        <Label style={{ color: low ? colors.coral : colors.lime, flex: 1 }}>{low ? "REST ENDING — GET READY" : "REST"}</Label>
        <Num size={20} style={{ color: low ? colors.coral : colors.textPrimary }} accessibilityLabel={`${Math.ceil(left)} seconds of rest left`}>
          {Math.floor(Math.ceil(left) / 60)}:{String(Math.ceil(left) % 60).padStart(2, "0")}
        </Num>
        <Button label="Back to set" variant="secondary" size="sm" onPress={onBack} style={{ paddingHorizontal: 16 }} />
      </View>
      <ProgressBar pct={(left / Math.max(1, total)) * 100} tone={low ? "amber" : "lime"} height={4} />
    </View>
  );
}

type Props = {
  id: GameId;
  /** set when playing during a workout rest */
  rest?: { sessionId: string; onBack: () => void; onPickAnother: () => void };
};

export function GameHost({ id, rest }: Props) {
  useTheme();
  const g = GAME_MAP[id];
  const Play = PLAY[id];
  const [phase, setPhase] = useState<"intro" | "play" | "done">(rest ? "play" : "intro");
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<{ score: number; detail?: string; outcome: PlayResult | null } | null>(null);
  const { left, total } = useRestLeft(rest?.sessionId);
  const restOver = !!rest && left !== null && left <= 0;

  // rest time spent here: from opening until rest ends or you leave, whichever comes first
  const openedAt = useRef(0);
  const counted = useRef(false);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);
  const countRest = useCallback(() => {
    if (!rest || counted.current) return;
    counted.current = true;
    addRestSeconds((Date.now() - openedAt.current) / 1000);
  }, [rest]);
  useEffect(() => countRest, [countRest]);
  useEffect(() => {
    if (!restOver) return;
    countRest();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [restOver, countRest]);

  // stable across the 4×/s rest ticks, so game effects that depend on it don't restart
  const duringRest = !!rest;
  const done = useCallback(
    (score: number, detail?: string) => {
      setResult({ score, detail, outcome: null });
      setPhase("done");
      void recordRun(id, score, duringRest).then((outcome) => {
        setResult((r) => (r ? { ...r, outcome } : r));
        Haptics.notificationAsync(outcome.best || outcome.challenge ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
      });
    },
    [id, duringRest],
  );

  const again = () => {
    setResult(null);
    setRun((r) => r + 1);
    setPhase("play");
  };

  const canReplay = !rest || (left ?? 0) >= g.fit;

  return (
    <View style={{ flex: 1 }}>
      {rest && left !== null && !restOver ? <RestStrip left={left} total={total} onBack={rest.onBack} /> : null}

      {restOver ? (
        <RestOver onBack={rest!.onBack} />
      ) : phase === "intro" ? (
        <Intro id={id} onStart={() => setPhase("play")} />
      ) : phase === "done" && result ? (
        <Result
          id={id}
          score={result.score}
          detail={result.detail}
          outcome={result.outcome}
          primary={rest ? { label: "Back to set", onPress: rest.onBack } : { label: "Play again", onPress: again }}
          secondary={rest ? (canReplay ? { label: "Play again", onPress: again } : { label: "Something shorter", onPress: rest.onPickAnother }) : undefined}
        />
      ) : (
        <Play key={run} onDone={done} />
      )}
    </View>
  );
}

function Intro({ id, onStart }: { id: GameId; onStart: () => void }) {
  const g = GAME_MAP[id];
  const { bests } = useGameStats();
  const best = bests[id];
  const ch = dailyChallenge();
  return (
    <RaisedSurface radiusSize="large" style={{ padding: 24, gap: 14, alignItems: "center" }}>
      <Ionicons name={g.icon} size={40} color={colors.lime} />
      <Text color="secondary" style={{ textAlign: "center" }}>{g.blurb}</Text>
      {g.scored !== false ? <Label>{best != null ? `YOUR BEST · ${g.format(best).toUpperCase()}` : "NO SCORE YET"}</Label> : null}
      {ch.id === id ? <Text variant="meta" style={{ color: colors.amber, textAlign: "center" }}>Today's challenge: {ch.label}</Text> : null}
      <Button label="Start" onPress={onStart} style={{ alignSelf: "stretch" }} />
    </RaisedSurface>
  );
}

type Action = { label: string; onPress: () => void };

function Result({ id, score, detail, outcome, primary, secondary }: { id: GameId; score: number; detail?: string; outcome: PlayResult | null; primary: Action; secondary?: Action }) {
  const g = GAME_MAP[id];
  const best = !!outcome?.best;
  return (
    <RaisedSurface radiusSize="large" style={{ padding: 24, gap: 12, alignItems: "center" }}>
      <Label>{best ? "NEW BEST" : g.scored === false ? "DONE" : "FINAL SCORE"}</Label>
      <Num size={52} style={{ color: best ? colors.lime : colors.textPrimary }}>{g.format(score)}</Num>
      {detail ? <Text color="secondary" style={{ textAlign: "center" }}>{detail}</Text> : null}
      {outcome?.challenge ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 30, borderRadius: radius.pill, backgroundColor: "rgba(255,182,97,0.16)" }}>
          <Ionicons name="star" size={14} color={colors.amber} />
          <Text variant="meta" style={{ color: colors.amber }}>Daily challenge complete</Text>
        </View>
      ) : null}
      <View style={{ alignSelf: "stretch", marginTop: 8, gap: 8 }}>
        <Button label={primary.label} onPress={primary.onPress} />
        {secondary ? <Button label={secondary.label} variant="secondary" onPress={secondary.onPress} /> : null}
      </View>
    </RaisedSurface>
  );
}

function RestOver({ onBack }: { onBack: () => void }) {
  return (
    <RaisedSurface radiusSize="large" style={{ padding: 28, gap: 14, alignItems: "center" }}>
      <Ionicons name="barbell" size={44} color={colors.lime} />
      <Text variant="title" style={{ textAlign: "center" }}>Rest's over</Text>
      <Text color="secondary" style={{ textAlign: "center" }}>Time for your next set. The game will be here next rest.</Text>
      <Button label="Back to set" onPress={onBack} style={{ alignSelf: "stretch", marginTop: 6 }} />
    </RaisedSurface>
  );
}
