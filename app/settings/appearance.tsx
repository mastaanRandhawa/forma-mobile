import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAppearance, useSettings } from "@/api/settings";
import { useCustomization, useTheme } from "@/theme/theme-provider";
import { THEME_MAP } from "@/theme/themes";
import { colors, radius } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Card, PageHeader, SettingRow, Toggle } from "@/components/ui/extra";
import { Text } from "@/components/ui/text";
import { setDevicePrefs, useDevicePrefs } from "@/lib/device-prefs";
import { Segmented } from "@/components/ui/extra";

const MODES = [
  { id: "cm-light", label: "Light", icon: "sunny-outline" },
  { id: "cm-dark", label: "Dark", icon: "moon-outline" },
  { id: "cm-system", label: "System", icon: "phone-portrait-outline" },
] as const;

export default function AppearanceSettings() {
  useTheme();
  const router = useRouter();
  const appearance = useAppearance();
  const { update } = useSettings();
  const cz = useCustomization();
  const theme = THEME_MAP[cz.equipped.theme];
  const mode = cz.equipped.colorMode ?? "cm-system";
  const devicePrefs = useDevicePrefs();
  const navMode = devicePrefs.navMode ?? "expanded";
  return (
    <Screen>
      <PageHeader title="Appearance" />
      <Card title="Light or dark" >
        <Text color="secondary" style={{ marginBottom: 12 }}>A display mode, separate from your theme. Your theme's colours apply to both.</Text>
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
      <Card title="Theme & cosmetics">
        <Text color="secondary" style={{ marginBottom: 12 }}>Themes, accent colours, ambient effects, Kai's look, chat skins and profile flair all live in Customization.</Text>
        <Pressable onPress={() => router.push("/settings/customization")} style={{ borderRadius: radius.medium, overflow: "hidden" }}>
          <LinearGradient colors={[theme?.spec.bgSoft ?? colors.backgroundSoft, theme?.spec.accentSoft ?? colors.wine, theme?.spec.accent ?? colors.pink]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ color: "#fff", fontSize: 17 }}>{theme?.name ?? "Current theme"}</Text>
              <Text variant="meta" style={{ color: "rgba(255,255,255,0.78)" }}>Open customization</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </LinearGradient>
        </Pressable>
      </Card>
      <Card title="Navigation bar">
        <Text color="secondary" style={{ marginBottom: 12 }}>The tab bar stays full size by default. You can have it shrink to a compact icon-only pill while you scroll down, or keep it compact all the time.</Text>
        <Segmented value={navMode} onChange={(v) => setDevicePrefs({ navMode: v })} options={[{ value: "expanded", label: "Always full" }, { value: "auto", label: "Shrink on scroll" }, { value: "minimized", label: "Compact" }]} />
      </Card>
      <Card title="Motion">
        <SettingRow last title="Reduce motion" hint="Minimize animation and ambient theme effects across the app." right={<Toggle value={appearance.reduceMotion} onChange={(v) => update({ appearance: { reduceMotion: v } })} />} />
      </Card>
    </Screen>
  );
}
