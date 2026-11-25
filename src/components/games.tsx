/** Shared pieces for the mini-games: the intro card and the result card. */
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { GAME_MAP, useGameBests, type GameId } from "@/lib/games";
import { colors } from "@/theme/tokens";
import { Button } from "@/components/ui/controls";
import { RaisedSurface } from "@/components/ui/surface";
import { Label, Num, Text } from "@/components/ui/text";

export function GameIntro({ id, children, onStart }: { id: GameId; children?: ReactNode; onStart: () => void }) {
  const g = GAME_MAP[id];
  const { bests } = useGameBests();
  const best = bests[id];
  return (
    <RaisedSurface radiusSize="large" style={{ padding: 24, gap: 14, alignItems: "center" }}>
      <Ionicons name={g.icon} size={40} color={colors.lime} />
      <Text color="secondary" style={{ textAlign: "center" }}>{g.blurb}</Text>
      {children}
      <Label>{best != null ? `YOUR BEST · ${g.format(best).toUpperCase()}` : "NO SCORE YET"}</Label>
      <Button label="Start" onPress={onStart} style={{ alignSelf: "stretch" }} />
    </RaisedSurface>
  );
}

/** Records the score once on mount and shows it, flagging a new best. */
export function GameResult({ id, score, detail, onAgain }: { id: GameId; score: number; detail?: string; onAgain: () => void }) {
  const g = GAME_MAP[id];
  const { submit } = useGameBests();
  const [record, setRecord] = useState(false);
  useEffect(() => {
    void submit(id, score).then((better) => {
      setRecord(better);
      Haptics.notificationAsync(better ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    });
  }, [id, score, submit]);
  return (
    <RaisedSurface radiusSize="large" style={{ padding: 24, gap: 12, alignItems: "center" }}>
      <Label>{record ? "NEW BEST" : "FINAL SCORE"}</Label>
      <Num size={52} style={{ color: record ? colors.lime : colors.textPrimary }}>{g.format(score)}</Num>
      {detail ? <Text color="secondary" style={{ textAlign: "center" }}>{detail}</Text> : null}
      <View style={{ alignSelf: "stretch", marginTop: 8 }}>
        <Button label="Play again" onPress={onAgain} />
      </View>
    </RaisedSurface>
  );
}
