/** One game, outside a workout (free play from the Games hub). */
import { useLocalSearchParams } from "expo-router";
import { GAME_MAP, isGameId } from "@/lib/games";
import { useTheme } from "@/theme/theme-provider";
import { Screen } from "@/components/ui/screen";
import { EmptyState, PageHeader } from "@/components/ui/extra";
import { GameHost } from "@/components/games/host";

export default function GameScreen() {
  useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!isGameId(id)) {
    return (
      <Screen>
        <PageHeader title="Games" />
        <EmptyState title="Game not found" body="It may have been removed. Pick another from the Games list." />
      </Screen>
    );
  }
  return (
    <Screen reveal={false} scroll={false}>
      <PageHeader title={GAME_MAP[id].title} />
      <GameHost key={id} id={id} />
    </Screen>
  );
}
