import { gated } from "@/components/feature-gate";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "@/api/hooks";
import { customizationItems, type CustomizationItem } from "@/theme/catalog";
import { useCustomization, useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, SectionHeading } from "@/components/ui/controls";
import { Card, PageHeader, PageSkeleton } from "@/components/ui/extra";
import { Label, Num, Text } from "@/components/ui/text";
import { swatchColors } from "./settings/customization";

const EARN_WAYS = [
  { id: "workout", label: "Finish a workout", detail: "Reward scales with volume and completion", coins: "+40–120" },
  { id: "form", label: "Clean form session", detail: "Average form above 90%", coins: "+25" },
  { id: "pr", label: "Set a personal record", detail: "Any lift beats its previous best", coins: "+50 each" },
  { id: "daily", label: "Daily check-in", detail: "Open Forma and log how you feel", coins: "+15" },
  { id: "streak", label: "Keep your streak", detail: "Bonuses at 3 / 7 / 14 / 30 / 60 / 100 days", coins: "+30–400" },
  { id: "goal", label: "Hit a goal", detail: "Every daily or weekly goal you complete", coins: "+20–60" },
  { id: "week", label: "Weekly training target", detail: "Reach your planned sessions for the week", coins: "+90" },
  { id: "achievement", label: "Unlock an achievement", detail: "One-off payouts for milestones", coins: "+75–500" },
];

// Themes, accent colours and light/dark are free — the store sells the rest.
const TABS = [
  { id: "all", label: "All", group: null },
  { id: "effects", label: "Effects", group: "Effects" },
  { id: "kai", label: "Kai", group: "Kai" },
  { id: "chat", label: "Chat", group: "Chat" },
  { id: "profile", label: "Profile", group: "Profile" },
  { id: "font", label: "Font", group: "Font" },
] as const;
const STORE_SLOTS = new Set(["effect", "avatar", "chatTheme", "frame", "title", "badge", "font"]);
const catalogue = customizationItems.filter((i) => STORE_SLOTS.has(i.slot));
const RARITY_COLOR: Record<string, string> = { common: "rgba(255,255,255,0.12)", rare: "rgba(131,233,244,0.5)", epic: "rgba(179,101,150,0.6)", legendary: "rgba(255,182,97,0.75)" };

function StoreScreen() {
  useTheme();
  const wallet = useWallet();
  const cz = useCustomization();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const balance = wallet.data?.balance ?? cz.balance;

  const shown = useMemo(() => {
    const group = TABS.find((t) => t.id === tab)?.group;
    return catalogue.filter((i) => (!group || i.group === group) && (!ownedOnly || cz.isOwned(i.id)));
  }, [tab, ownedOnly, cz]);

  async function buy(item: CustomizationItem) {
    if (balance < item.price) return Alert.alert("Not enough coins", `You need ${item.price - balance} more.`);
    const ok = await cz.buy(item, false);
    if (ok) wallet.refetch();
    else Alert.alert("Couldn't buy", "Try again.");
  }

  if (wallet.initialLoading) return <Screen><PageHeader title="Store" /><PageSkeleton /></Screen>;

  return (
    <Screen>
      <PageHeader title="The store" right={<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Ionicons name="logo-bitcoin" size={16} color={colors.amber} /><Num size={18}>{balance.toLocaleString()}</Num></View>} />
      <Card>
        <Label>THIS WEEK</Label>
        <Num size={28} style={{ marginTop: 6 }}>+{wallet.data?.earnedThisWeek ?? 0}</Num>
        <Text variant="meta" color="tertiary">coins earned</Text>
      </Card>

      <SectionHeading title="Ways to earn" />
      <Card>
        {EARN_WAYS.map((w, i) => (
          <View key={w.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 8, borderBottomWidth: i === EARN_WAYS.length - 1 ? 0 : 1, borderBottomColor: colors.lineSoft }}>
            <View style={{ flex: 1 }}><Text>{w.label}</Text><Text variant="meta" color="tertiary">{w.detail}</Text></View>
            <Num size={14} style={{ color: colors.amber }}>{w.coins}</Num>
          </View>
        ))}
      </Card>

      <SectionHeading title="Catalogue" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {TABS.map((t) => <Chip key={t.id} label={t.label} active={tab === t.id} onPress={() => setTab(t.id)} />)}
        <Chip label="Owned" active={ownedOnly} onPress={() => setOwnedOnly((v) => !v)} />
      </ScrollView>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {shown.map((item) => {
          const owned = cz.isOwned(item.id);
          const equipped = cz.isEquipped(item.id, item.slot);
          return (
            <View key={item.id} style={{ width: "48%", borderRadius: radius.medium, borderWidth: 1, borderColor: RARITY_COLOR[item.rarity], backgroundColor: colors.surface, overflow: "hidden" }}>
              <LinearGradient colors={swatchColors(item.swatch)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 64 }} />
              <View style={{ padding: 12, gap: 6 }}>
                <Text style={{ fontSize: 15 }} numberOfLines={1}>{item.name}</Text>
                <Text variant="meta" color="tertiary" numberOfLines={2} style={{ minHeight: 30 }}>{item.detail}</Text>
                <Label>{item.rarity.toUpperCase()}</Label>
                {equipped ? <Chip label="Equipped" active /> : owned ? <Chip label="Equip" onPress={() => cz.equip(item)} /> : <Pressable onPress={() => buy(item)} style={{ height: 36, borderRadius: radius.pill, backgroundColor: colors.btnWhite, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: balance >= item.price ? 1 : 0.5 }}><Ionicons name="logo-bitcoin" size={13} color={colors.btnWhiteInk} /><Text style={{ color: colors.btnWhiteInk, fontSize: 13 }}>{item.price}</Text></Pressable>}
              </View>
            </View>
          );
        })}
      </View>

      <SectionHeading title="Recent activity" />
      <Card>
        {(wallet.data?.recent ?? []).length === 0 ? <Text color="tertiary">No transactions yet.</Text> : wallet.data!.recent.map((t) => (
          <View key={t.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
            <Text style={{ flex: 1 }}>{t.label}</Text>
            <Num size={14} style={{ color: t.type === "earn" ? colors.lime : colors.textSecondary }}>{t.type === "earn" ? "+" : "−"}{t.amount}</Num>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

export default gated("store", StoreScreen);
