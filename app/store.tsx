import { gated } from "@/components/feature-gate";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, Modal, Pressable, ScrollView, View } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "@/api/hooks";
import { toast } from "@/components/ui/toast";
import { customizationItems, type CustomizationItem } from "@/theme/catalog";
import { useCustomization, useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, ProgressBar, SectionHeading } from "@/components/ui/controls";
import { Card, PageHeader, PageSkeleton } from "@/components/ui/extra";
import { Label, Num, Text } from "@/components/ui/text";
import { swatchColors } from "@/lib/swatch";

// Coins pay for training and recovery — opening the app earns nothing.
const EARN_WAYS = [
  { id: "workout", label: "Finish a workout", detail: "Scales with the work you put in", coins: "+40–120" },
  { id: "pr", label: "Set a personal record", detail: "Any lift beats its previous best", coins: "+50 each" },
  { id: "quest", label: "Weekly quests", detail: "Three on Home, reset every Monday", coins: "+120–180" },
  { id: "streak", label: "Weekly streak", detail: "Hit your target at 2 / 4 / 8 / 12 / 26 / 52 weeks", coins: "+60–600" },
  { id: "checkin", label: "Recovery check-in", detail: "Once a day — rest days count too", coins: "+15" },
  { id: "goal", label: "Hit a goal", detail: "Every daily or weekly goal you complete", coins: "+30" },
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
  const [celebrate, setCelebrate] = useState<CustomizationItem | null>(null);
  const featured = useMemo(() => catalogue.filter((i) => (i.rarity === "legendary" || i.rarity === "epic") && !cz.isOwned(i.id)).slice(0, 3), [cz]);

  const shown = useMemo(() => {
    const group = TABS.find((t) => t.id === tab)?.group;
    return catalogue.filter((i) => (!group || i.group === group) && (!ownedOnly || cz.isOwned(i.id)));
  }, [tab, ownedOnly, cz]);

  function buy(item: CustomizationItem) {
    if (balance < item.price) return Alert.alert("Not enough coins", `${item.name} costs ${item.price}. You need ${item.price - balance} more — finish a workout or a weekly quest to earn them.`);
    Alert.alert(`Unlock ${item.name}?`, `${item.price} coins · you'll have ${balance - item.price} left.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: `Unlock · ${item.price}`,
        onPress: async () => {
          const ok = await cz.buy(item, false);
          if (ok) {
            wallet.refetch();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setCelebrate(item);
          } else toast.error("Couldn't complete the purchase. Try again.");
        },
      },
    ]);
  }

  if (wallet.initialLoading) return <Screen><PageHeader title="Store" /><PageSkeleton /></Screen>;

  return (
    <Screen onRefresh={wallet.reload}>
      <PageHeader title="The store" />
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Label>BALANCE</Label>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
              <Ionicons name="logo-bitcoin" size={22} color={colors.amber} />
              <Num size={28}>{balance.toLocaleString()}</Num>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Num size={18} style={{ color: colors.amber }}>+{wallet.data?.earnedThisWeek ?? 0}</Num>
            <Text variant="meta" color="tertiary">this week</Text>
          </View>
        </View>
        <Text variant="meta" color="tertiary" style={{ marginTop: 10 }}>Weekly quests live on Home. Your rank comes from training, not coins.</Text>
      </Card>

      {featured.length ? (
        <>
          <SectionHeading title="Save toward" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {featured.map((item) => (
              <Pressable key={item.id} onPress={() => buy(item)} style={{ width: 200, borderRadius: radius.medium, overflow: "hidden", borderWidth: 1, borderColor: RARITY_COLOR[item.rarity], backgroundColor: colors.surface }}>
                <LinearGradient colors={swatchColors(item.swatch)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 80 }} />
                <View style={{ padding: 12, gap: 6 }}>
                  <Text numberOfLines={1}>{item.name}</Text>
                  <Label>{item.rarity.toUpperCase()}</Label>
                  <ProgressBar pct={Math.min(100, (balance / item.price) * 100)} tone="amber" height={5} />
                  <Text variant="meta" color="tertiary">{balance >= item.price ? "You can unlock this" : `${(item.price - balance).toLocaleString()} to go`} · {item.price}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

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
                {equipped ? <Chip label="Equipped" active /> : owned ? <Chip label="Equip" onPress={async () => { await cz.equip(item); toast.success(`${item.name} equipped`); }} /> : <Pressable onPress={() => buy(item)} style={{ height: 36, borderRadius: radius.pill, backgroundColor: colors.btnWhite, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: balance >= item.price ? 1 : 0.5 }}><Ionicons name="logo-bitcoin" size={13} color={colors.btnWhiteInk} /><Text style={{ color: colors.btnWhiteInk, fontSize: 13 }}>{item.price}</Text></Pressable>}
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
      {celebrate ? <PurchaseCelebration item={celebrate} onDone={() => setCelebrate(null)} onEquip={async () => { await cz.equip(celebrate); toast.success(`${celebrate.name} equipped`); setCelebrate(null); }} /> : null}
    </Screen>
  );
}

/** Coin burst + reveal card after an unlock (website: PurchaseCelebration). */
function PurchaseCelebration({ item, onDone, onEquip }: { item: CustomizationItem; onDone: () => void; onEquip: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  const particles = useMemo(() => Array.from({ length: 18 }, (_, i) => { const ang = (i / 18) * Math.PI * 2; const d = 90 + Math.random() * 90; return { x: Math.cos(ang) * d, y: Math.sin(ang) * d, s: 6 + Math.random() * 6 }; }), []);
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [a]);
  const color = item.rarity === "legendary" ? colors.amber : item.rarity === "epic" ? colors.mauve : colors.cyan;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone} statusBarTranslucent>
    <Pressable onPress={onDone} style={{ flex: 1, backgroundColor: "rgba(10,4,9,0.7)", alignItems: "center", justifyContent: "center" }} accessibilityLabel="Dismiss">
      {particles.map((p, i) => (
        <Animated.View key={i} style={{ position: "absolute", width: p.s, height: p.s, borderRadius: p.s / 2, backgroundColor: color, opacity: a.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] }), transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }) }, { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, p.y + 30] }) }] }} />
      ))}
      <Animated.View style={{ width: 260, padding: 20, borderRadius: radius.large, backgroundColor: colors.surfaceOpaque, borderWidth: 1, borderColor: color, alignItems: "center", gap: 10, transform: [{ scale: a.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.05, 1] }) }] }}>
        <LinearGradient colors={swatchColors(item.swatch)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 64, height: 64, borderRadius: 32 }} />
        <Label style={{ color }}>{item.rarity.toUpperCase()} · UNLOCKED</Label>
        <Text variant="heading" style={{ textAlign: "center" }}>{item.name}</Text>
        <Text variant="meta" color="tertiary">Added to your collection</Text>
        <View style={{ alignSelf: "stretch", gap: 8, marginTop: 6 }}>
          <Button label="Equip now" variant="accent" onPress={onEquip} />
          <Button label="Later" variant="ghost" onPress={onDone} />
        </View>
      </Animated.View>
    </Pressable>
    </Modal>
  );
}

export default gated("store", StoreScreen);
