import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useProgression } from "@/api/settings";
import { useAuth } from "@/auth/auth-provider";
import type { FeatureKey } from "@/api/types";
import { useCustomization, useTheme } from "@/theme/theme-provider";
import { THEME_MAP } from "@/theme/themes";
import { colors } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, SectionHeading } from "@/components/ui/controls";
import { Card, SettingRow } from "@/components/ui/extra";
import { Label, Text } from "@/components/ui/text";

type Item = { to: string; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap; feature?: FeatureKey };

const ITEMS: Item[] = [
  { to: "/progress", label: "Progress", hint: "Trends, strength, recovery", icon: "stats-chart-outline", feature: "progress_basic" },
  { to: "/body", label: "Body", hint: "Muscle map & balance", icon: "body-outline", feature: "body_map" },
  { to: "/records", label: "Records", hint: "PRs and achievements", icon: "trophy-outline" },
  { to: "/goals", label: "Goals", hint: "Daily & weekly targets", icon: "flag-outline", feature: "goals" },
  { to: "/exercises", label: "Exercise library", hint: "Search every movement", icon: "library-outline" },
  { to: "/store", label: "Store", hint: "Spend coins on cosmetics", icon: "bag-handle-outline", feature: "store" },
  { to: "/notifications", label: "Notifications", hint: "Reminders & milestones", icon: "notifications-outline" },
];

export default function More() {
  useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const prog = useProgression();
  const cz = useCustomization();
  const locked = (i: Item) => (i.feature ? !prog.has(i.feature) : false);

  return (
    <Screen tabs>
      <Text variant="title" style={{ marginBottom: 16 }}>More</Text>
      <Pressable onPress={() => router.push("/settings")}>
        <Card>
          <Label>SIGNED IN AS</Label>
          <Text variant="heading">{user?.name}</Text>
          <Text color="secondary">{user?.email}</Text>
          <Text variant="meta" color="tertiary" style={{ marginTop: 6 }}>Theme · {THEME_MAP[cz.equipped.theme]?.name ?? "Default"}</Text>
        </Card>
      </Pressable>

      <SectionHeading title="Explore" />
      <Card>
        {ITEMS.map((i, idx) => (
          <SettingRow
            key={i.to}
            icon={i.icon}
            title={i.label}
            hint={locked(i) ? "Locked — unlocks as you train" : i.hint}
            right={locked(i) ? <Ionicons name="lock-closed" size={15} color={colors.textTertiary} /> : undefined}
            onPress={locked(i) ? undefined : () => router.push(i.to as never)}
            last={idx === ITEMS.length - 1}
          />
        ))}
      </Card>

      <SectionHeading title="You" />
      <Card>
        <SettingRow icon="settings-outline" title="Settings" hint="Profile, appearance, privacy" onPress={() => router.push("/settings")} />
        <SettingRow icon="refresh-outline" title="Redo setup" hint="Run onboarding again" onPress={() => router.push("/onboarding")} last />
      </Card>
      <View style={{ marginTop: 6 }}><Button label="Sign out" variant="ghost" onPress={signOut} /></View>
    </Screen>
  );
}
