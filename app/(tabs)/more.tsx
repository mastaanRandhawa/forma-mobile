import { Alert, Platform, Pressable, View } from "react-native";
import { useNotifications, useWallet } from "@/api/hooks";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useProgression } from "@/api/settings";
import { useAuth } from "@/auth/auth-provider";
import type { FeatureKey } from "@/api/types";
import { useCustomization, useTheme } from "@/theme/theme-provider";
import { THEME_MAP } from "@/theme/themes";
import { colors } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, ProgressBar, SectionHeading } from "@/components/ui/controls";
import { useTrainingProgress } from "@/lib/progression";
import { Card, SettingRow } from "@/components/ui/extra";
import { Label, Num, Text } from "@/components/ui/text";

type Item = { to: string; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap; feature?: FeatureKey };

const ITEMS: Item[] = [
  { to: "/progress", label: "Progress", hint: "Trends, strength, recovery", icon: "stats-chart-outline", feature: "progress_basic" },
  { to: "/body", label: "Body", hint: "Muscle map & balance", icon: "body-outline", feature: "body_map" },
  { to: "/records", label: "Records", hint: "PRs and achievements", icon: "trophy-outline" },
  { to: "/goals", label: "Goals", hint: "Daily & weekly targets", icon: "flag-outline", feature: "goals" },
  { to: "/exercises", label: "Exercise library", hint: "Search every movement", icon: "library-outline" },
  ...(Platform.OS === "android" ? [{ to: "/app-lock", label: "App lock", hint: "Spend coins to open social apps", icon: "lock-closed-outline" } as Item] : []),
  { to: "/games", label: "Games", hint: "Quick games for rest periods", icon: "game-controller-outline" },
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
  const wallet = useWallet();
  const { rank, streak } = useTrainingProgress();
  const notes = useNotifications();
  const unread = notes.data?.unreadCount ?? 0;
  const confirmSignOut = () =>
    Alert.alert("Sign out?", "You'll need your email and password to sign back in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);

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
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Label>RANK {rank.rank}</Label>
            <Text variant="heading">{rank.title}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Num size={18}>{rank.xp.toLocaleString()}</Num>
            <Text variant="meta" color="tertiary">XP · past year</Text>
          </View>
        </View>
        <View style={{ marginTop: 12, gap: 6 }}>
          <ProgressBar pct={rank.pct * 100} tone="pink" height={6} />
          <Text variant="meta" color="tertiary">
            {rank.next ? `${rank.toNext.toLocaleString()} XP to ${rank.next.title}` : "Top rank"} · {streak.weeks > 0 ? `${streak.weeks}-week streak` : "no streak yet"}
          </Text>
        </View>
        <Text variant="meta" color="tertiary" style={{ marginTop: 8 }}>Earned by training: +100 per workout, +150 for every week you hit your target.</Text>
      </Card>
      <Pressable onPress={() => (prog.has("store") ? router.push("/store") : undefined)} disabled={!prog.has("store")}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Ionicons name="logo-bitcoin" size={22} color={colors.amber} />
          <View style={{ flex: 1 }}>
            <Num size={20}>{(wallet.data?.balance ?? 0).toLocaleString()}</Num>
            <Text variant="meta" color="tertiary">coins · +{wallet.data?.earnedThisWeek ?? 0} this week</Text>
          </View>
          {prog.has("store") ? <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} /> : <Text variant="meta" color="tertiary">Store opens after your first workout</Text>}
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
            right={locked(i) ? <Ionicons name="lock-closed" size={15} color={colors.textTertiary} /> : i.to === "/notifications" && unread ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.pink, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}><Text style={{ color: "#fff", fontSize: 12 }}>{unread > 99 ? "99+" : unread}</Text></View> : undefined}
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
      <View style={{ marginTop: 6 }}><Button label="Sign out" variant="ghost" onPress={confirmSignOut} /></View>
    </Screen>
  );
}
