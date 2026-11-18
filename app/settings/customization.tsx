import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCustomization, useTheme } from "@/theme/theme-provider";
import { THEMES } from "@/theme/themes";
import { customizationItems, type CustomizationSlot } from "@/theme/catalog";
import { colors, radius } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Card, PageHeader } from "@/components/ui/extra";
import { Text } from "@/components/ui/text";

/** Pull the colour stops out of a CSS gradient string ("linear-gradient(140deg,#2A1120,#7A174F 60%,#D51A7A)"). */
export function swatchColors(sw?: string): [string, string, ...string[]] {
  const hex = sw?.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g) ?? [];
  if (hex.length >= 2) return hex as [string, string, ...string[]];
  const one = hex[0] ?? "rgba(255,255,255,0.08)";
  return [one, one];
}

const OTHER_SLOTS: { slot: CustomizationSlot; title: string; desc: string }[] = [
  { slot: "effect", title: "Ambient effect", desc: "The motion layer behind the interface. Some themes ship their own." },
  { slot: "avatar", title: "Kai's look", desc: "The gradient on Kai's avatar in chat and on the coach orb." },
  { slot: "chatTheme", title: "Chat skin", desc: "How the trainer conversation is styled." },
  { slot: "frame", title: "Profile frame", desc: "The ring around your avatar." },
  { slot: "title", title: "Profile title", desc: "Shown under your name across the app." },
  { slot: "badge", title: "Profile badge", desc: "A small mark next to your name." },
];

const MODES = [
  { id: "cm-light", label: "Light", icon: "sunny-outline" },
  { id: "cm-dark", label: "Dark", icon: "moon-outline" },
  { id: "cm-system", label: "System", icon: "phone-portrait-outline" },
] as const;

function SlotGrid({ slot }: { slot: CustomizationSlot }) {
  const cz = useCustomization();
  const router = useRouter();
  const items = customizationItems.filter((i) => i.slot === slot);
  const locked = items.filter((i) => !cz.isOwned(i.id)).length;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {items.map((item) => {
          const owned = cz.isOwned(item.id);
          const active = cz.isEquipped(item.id, item.slot);
          return (
            <Pressable key={item.id} disabled={!owned} onPress={() => cz.setSlot(item.slot, item.id)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: active ? colors.lineHighlight : colors.lineSoft, backgroundColor: active ? colors.surfaceRaised : "transparent", opacity: owned ? 1 : 0.5 }}>
              <LinearGradient colors={swatchColors(item.swatch)} style={{ width: 22, height: 22, borderRadius: 11 }} />
              <View>
                <Text style={{ fontSize: 13 }}>{item.name}</Text>
                <Text variant="meta" color="tertiary" style={{ fontSize: 11 }}>{owned ? (active ? "Equipped" : "Owned") : `${item.price} coins`}</Text>
              </View>
              {!owned ? <Ionicons name="lock-closed" size={11} color={colors.textTertiary} /> : null}
            </Pressable>
          );
        })}
      </View>
      {locked > 0 ? (
        <Text variant="meta" color="tertiary">{locked} locked · <Text variant="meta" color="pink" onPress={() => router.push("/store")}>unlock in the store</Text></Text>
      ) : null}
    </View>
  );
}

export default function Customization() {
  useTheme();
  const router = useRouter();
  const cz = useCustomization();
  const owned = customizationItems.filter((i) => cz.isOwned(i.id)).length;
  const mode = cz.equipped.colorMode ?? "cm-system";
  const light = cz.mode === "light";

  return (
    <Screen>
      <PageHeader title="Customization" />
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text variant="heading">Your customization</Text>
            <Text variant="meta" color="tertiary">{owned} of {customizationItems.length} unlocked · {cz.balance.toLocaleString()} coins</Text>
          </View>
          <Pressable onPress={() => router.push("/store")} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 13 }}>Open store</Text>
          </Pressable>
        </View>
      </Card>

      <Card title="Appearance mode">
        <View style={{ flexDirection: "row", gap: 10 }}>
          {MODES.map((m) => {
            const active = mode === m.id;
            return (
              <Pressable key={m.id} onPress={() => cz.setSlot("colorMode", m.id)} style={{ flex: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: radius.small, borderWidth: 1, borderColor: active ? colors.lineHighlight : colors.lineSoft, backgroundColor: active ? colors.surfaceRaised : "transparent" }}>
                <Ionicons name={m.icon} size={19} color={active ? colors.textPrimary : colors.textTertiary} />
                <Text style={{ fontSize: 13 }}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card title="Theme">
        <Text color="secondary" style={{ marginBottom: 12 }}>A colour world — accent family, background hue, corner radius and ambient motion. All free, all render in light and dark.</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {THEMES.map((t) => {
            const active = cz.equipped.theme === t.id;
            const ink = light ? "#211A24" : "rgba(255,255,255,0.96)";
            return (
              <Pressable key={t.id} onPress={() => cz.setSlot("theme", t.id)} style={{ width: "48%", borderRadius: radius.small, overflow: "hidden", borderWidth: 2, borderColor: active ? ink : "transparent" }}>
                <LinearGradient colors={swatchColors(light ? t.swatchLight : t.swatch)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 14, minHeight: 78, justifyContent: "flex-end" }}>
                  <Text style={{ color: ink, fontSize: 15 }}>{t.name}</Text>
                  <Text variant="meta" style={{ color: ink, opacity: 0.6 }}>{active ? "Equipped" : "Included"}</Text>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card title="Accent colour">
        <SlotGrid slot="accent" />
      </Card>

      {OTHER_SLOTS.map((s) => (
        <Card key={s.slot} title={s.title}>
          <Text color="secondary" style={{ marginBottom: 10 }}>{s.desc}</Text>
          <SlotGrid slot={s.slot} />
        </Card>
      ))}
    </Screen>
  );
}
