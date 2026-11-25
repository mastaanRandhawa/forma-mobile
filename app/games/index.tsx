/** Games hub — quick mini-games for rest periods, with device-local bests. */
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GAMES, useGameBests } from "@/lib/games";
import { useTheme } from "@/theme/theme-provider";
import { colors } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { PageHeader } from "@/components/ui/extra";
import { PressScale } from "@/components/ui/pressable";
import { SoftSurface } from "@/components/ui/surface";
import { Label, Text } from "@/components/ui/text";

export default function GamesHub() {
  useTheme();
  // read per render so a theme switch repaints the tints
  const TINT = [colors.lime, colors.cyan, colors.amber];
  const router = useRouter();
  const { bests } = useGameBests();
  return (
    <Screen>
      <PageHeader title="Games" subtitle="Something quick for between sets." />
      {GAMES.map((g, i) => {
        const best = bests[g.id];
        const tint = TINT[i % TINT.length];
        return (
          <PressScale key={g.id} onPress={() => router.push(`/games/${g.id}` as never)} accessibilityLabel={`Play ${g.title}`} style={{ marginBottom: 12 }}>
            <SoftSurface style={{ padding: 18, flexDirection: "row", gap: 14, alignItems: "center" }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
                <Ionicons name={g.icon} size={24} color={tint} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="heading">{g.title}</Text>
                <Text variant="meta" color="secondary">{g.blurb}</Text>
                <Label style={{ marginTop: 4 }}>{best != null ? `BEST · ${g.format(best).toUpperCase()}` : "NOT PLAYED YET"}</Label>
              </View>
              <Ionicons name="play-circle" size={30} color={tint} />
            </SoftSurface>
          </PressScale>
        );
      })}
      <Text variant="meta" color="tertiary" style={{ textAlign: "center", marginTop: 8 }}>Best scores are saved on this device only.</Text>
    </Screen>
  );
}
