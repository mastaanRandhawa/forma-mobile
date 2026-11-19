import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth/auth-provider";
import { useAppearance, usePrefs, useProgression } from "@/api/settings";
import { useCustomization, useTheme } from "@/theme/theme-provider";
import { THEME_MAP } from "@/theme/themes";
import { customizationItems } from "@/theme/catalog";
import { GOAL_LABELS } from "@/lib/profile-options";
import { Screen } from "@/components/ui/screen";
import { useTour } from "@/components/tour/tour";
import { Card, PageHeader, SettingRow } from "@/components/ui/extra";
import { Button } from "@/components/ui/controls";
import { Text } from "@/components/ui/text";

export default function SettingsOverview() {
  useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const prog = useProgression();
  const prefs = usePrefs();
  const appearance = useAppearance();
  const cz = useCustomization();

  const summary = [user?.experienceLevel, user?.fitnessGoal ? GOAL_LABELS[user.fitnessGoal] : null, user?.trainingFrequencyTarget ? `${user.trainingFrequencyTarget} days/week` : null].filter(Boolean).join(" · ");
  const notifCount = Object.values(prefs.notifications).filter(Boolean).length;
  const tour = useTour();
  const themeName = THEME_MAP[cz.equipped.theme]?.name ?? "default";
  const owned = customizationItems.filter((i) => cz.isOwned(i.id)).length;

  const rows: { to: string; label: string; value: string; icon: React.ComponentProps<typeof SettingRow>["icon"] }[] = [
    { to: "/settings/training", label: "Training profile", value: summary || "Set up your training profile", icon: "barbell-outline" },
    { to: "/settings/coaching", label: "Coaching & interface", value: prog.gatingEnabled ? "Simple — reveal features as I train" : "Full experience", icon: "sparkles-outline" },
    { to: "/settings/connections", label: "Connections", value: "Wearables & health data", icon: "watch-outline" },
    { to: "/settings/notifications", label: "Notifications", value: `${notifCount} enabled`, icon: "notifications-outline" },
    { to: "/settings/appearance", label: "Appearance", value: appearance.reduceMotion ? "Reduced motion" : "Standard motion", icon: "contrast-outline" },
    { to: "/settings/customization", label: "Customization", value: `${themeName} · ${owned} unlocked`, icon: "color-palette-outline" },
    { to: "/settings/privacy", label: "Privacy & data", value: prefs.camera.formTracking ? "Form tracking on" : "Form tracking off", icon: "shield-checkmark-outline" },
    { to: "/settings/account", label: "Account", value: user?.email ?? "", icon: "person-circle-outline" },
  ];

  return (
    <Screen>
      <PageHeader title="Settings" />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text variant="heading">{user?.name}</Text>
            <Text variant="meta" color="tertiary">{summary || "No training profile yet"}</Text>
          </View>
          <View style={{ width: 120 }}><Button label="Edit" variant="ghost" onPress={() => router.push("/settings/training")} style={{ height: 42 }} /></View>
        </View>
      </Card>
      <Card>
        {rows.map((r, i) => (
          <SettingRow key={r.to} title={r.label} hint={r.value} icon={r.icon} onPress={() => router.push(r.to as never)} last={false} />
        ))}
        <SettingRow title="Replay app tour" hint="A short walkthrough of the main features" icon="compass-outline" onPress={() => tour.start()} last />
      </Card>
    </Screen>
  );
}
