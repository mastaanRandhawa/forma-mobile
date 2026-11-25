/** Game cards (hub + rest picker) and the daily-challenge banner. */
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { dailyChallenge, GAME_MAP, GAMES, today, useGameStats, type GameId } from "@/lib/games";
import { useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { PressScale } from "@/components/ui/pressable";
import { SoftSurface } from "@/components/ui/surface";
import { Label, Text } from "@/components/ui/text";

const tint = (id: GameId) => ({ plates: colors.lime, reflex: colors.cyan, muscles: colors.amber, breathe: colors.jade })[id];

/** `restLeft` (seconds): games that won't finish in time are dimmed and labelled. */
export function GameList({ onPick, restLeft }: { onPick: (id: GameId) => void; restLeft?: number }) {
  useTheme();
  const { bests } = useGameStats();
  return (
    <View style={{ gap: 12 }}>
      {GAMES.map((g) => {
        const best = bests[g.id];
        const tooLong = restLeft != null && g.fit > restLeft;
        return (
          <PressScale key={g.id} onPress={() => onPick(g.id)} accessibilityLabel={`Play ${g.title}`} style={{ opacity: tooLong ? 0.5 : 1 }}>
            <SoftSurface style={{ padding: 16, flexDirection: "row", gap: 14, alignItems: "center" }}>
              <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
                <Ionicons name={g.icon} size={23} color={tint(g.id)} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text variant="heading">{g.title}</Text>
                  <Text variant="meta" color="tertiary">{g.fit ? `~${g.fit}s` : "any length"}</Text>
                </View>
                <Text variant="meta" color="secondary">{g.blurb}</Text>
                <Label style={{ marginTop: 3 }}>
                  {tooLong ? "NOT ENOUGH REST LEFT" : g.scored === false ? "RECOVERY" : best != null ? `BEST · ${g.format(best).toUpperCase()}` : "NOT PLAYED YET"}
                </Label>
              </View>
              <Ionicons name="play-circle" size={30} color={tint(g.id)} />
            </SoftSurface>
          </PressScale>
        );
      })}
    </View>
  );
}

export function ChallengeBanner({ onPlay }: { onPlay: (id: GameId) => void }) {
  useTheme();
  const { challenges } = useGameStats();
  const ch = dailyChallenge();
  const done = !!challenges[today()];
  return (
    <PressScale onPress={() => onPlay(ch.id)} accessibilityLabel={`Today's challenge: ${ch.label}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.medium, backgroundColor: "rgba(255,182,97,0.12)", borderWidth: 1, borderColor: "rgba(255,182,97,0.3)" }}>
        <Ionicons name={done ? "star" : "star-outline"} size={22} color={colors.amber} />
        <View style={{ flex: 1 }}>
          <Label style={{ color: colors.amber }}>{done ? "TODAY'S CHALLENGE · DONE" : "TODAY'S CHALLENGE"}</Label>
          <Text>{ch.label}</Text>
        </View>
        {!done ? <Text variant="meta" color="tertiary">{GAME_MAP[ch.id].title}</Text> : null}
      </View>
    </PressScale>
  );
}
