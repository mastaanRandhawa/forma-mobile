/**
 * Rest-time games, opened from the rest card of the active workout. The rest
 * countdown stays on screen, games that won't finish in the time left are
 * dimmed, and when rest ends the game stops and points you back to your set.
 * The workout screen underneath keeps running its timer and alerts.
 */
import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { isGameId, type GameId } from "@/lib/games";
import { useTheme } from "@/theme/theme-provider";
import { Pinned, Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/controls";
import { GameHost, RestStrip, useRestLeft } from "@/components/games/host";
import { ChallengeBanner, GameList } from "@/components/games/list";

export default function RestPlay() {
  useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ session: string; game?: string }>();
  const [game, setGame] = useState<GameId | null>(isGameId(params.game) ? params.game : null);
  const { left, total } = useRestLeft(params.session);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/workout/active"));

  if (game) {
    return (
      <Screen reveal={false} scroll={false}>
        <GameHost key={game} id={game} rest={{ sessionId: params.session, onBack: back, onPickAnother: () => setGame(null) }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Pinned>{left ? <RestStrip left={left} total={total} onBack={back} /> : null}</Pinned>
      <View style={{ gap: 4, marginBottom: 16 }}>
        <Text variant="title">Play while you rest</Text>
        <Text color="secondary">{left ? "Pick something that fits. It stops when your rest is up." : "Your rest is over — time for the next set."}</Text>
      </View>
      {left ? (
        <>
          <View style={{ marginBottom: 14 }}>
            <ChallengeBanner onPlay={setGame} />
          </View>
          <GameList onPick={setGame} restLeft={left} />
        </>
      ) : (
        <Button label="Back to set" onPress={back} />
      )}
    </Screen>
  );
}
