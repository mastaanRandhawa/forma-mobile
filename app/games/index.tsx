/**
 * Games hub — short games for rest periods, so the phone in your hand between
 * sets is doing something that ends with the rest timer instead of a feed.
 * During a workout, the rest card opens these directly (workout/play).
 */
import { View } from "react-native";
import { useRouter } from "expo-router";
import { streakOf, useGameStats, type GameId } from "@/lib/games";
import { useTheme } from "@/theme/theme-provider";
import { Screen } from "@/components/ui/screen";
import { PageHeader } from "@/components/ui/extra";
import { SoftSurface } from "@/components/ui/surface";
import { Label, Num, Text } from "@/components/ui/text";
import { ChallengeBanner, GameList } from "@/components/games/list";

export default function GamesHub() {
  useTheme();
  const router = useRouter();
  const stats = useGameStats();
  const streak = streakOf(stats.days);
  const restMin = Math.round(stats.restSeconds / 60);
  const open = (id: GameId) => router.push(`/games/${id}` as never);
  return (
    <Screen>
      <PageHeader title="Games" subtitle="Quick games that end when your rest does. Start one from the rest timer during a workout." />
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
        <Stat label="DAY STREAK" value={String(streak)} />
        <Stat label="REST PLAYS" value={String(stats.restRuns)} />
        <Stat label="REST MIN HERE" value={String(restMin)} />
      </View>
      <View style={{ marginBottom: 14 }}>
        <ChallengeBanner onPlay={open} />
      </View>
      <GameList onPick={open} />
      <Text variant="meta" color="tertiary" style={{ textAlign: "center", marginTop: 14 }}>
        Rest minutes count time spent here during a workout rest instead of somewhere else on your phone. Scores stay on this device.
      </Text>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <SoftSurface radiusSize="medium" style={{ flex: 1, padding: 12, gap: 6 }}>
      <Num size={22}>{value}</Num>
      <Label>{label}</Label>
    </SoftSurface>
  );
}
