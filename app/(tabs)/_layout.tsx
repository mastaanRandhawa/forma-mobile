import { Pressable, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/build/layouts/Tabs";
import { GlassSurface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { colors, fonts, radius, shadow } from "@/theme/tokens";

const TABS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  dashboard: { label: "home", icon: "home-outline" },
  workouts: { label: "training", icon: "barbell-outline" },
  nutrition: { label: "nutrition", icon: "nutrition-outline" },
  trainer: { label: "trainer", icon: "chatbubble-ellipses-outline" },
  more: { label: "more", icon: "ellipsis-horizontal" },
};

/** Floating glass pill nav — the mobile equivalent of the website's TopNav. */
function FloatingTabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 12) }} pointerEvents="box-none">
      <GlassSurface radiusSize="pill" style={shadow.float}>
        <View style={{ flexDirection: "row", padding: 6 }}>
          {state.routes.map((route, i) => {
            const meta = TABS[route.name];
            if (!meta) return null;
            const active = state.index === i;
            return (
              <Pressable
                key={route.key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  if (!active) navigateToTab(route.key);
                }}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: radius.pill,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  backgroundColor: active ? "rgba(255,241,248,0.18)" : "transparent",
                  borderWidth: active ? 1 : 0,
                  borderColor: colors.lineHighlight,
                }}
              >
                <Ionicons name={meta.icon} size={19} color={active ? colors.textPrimary : colors.textTertiary} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 10, color: active ? colors.textPrimary : colors.textTertiary }}>
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <FloatingTabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="workouts" />
      <Tabs.Screen name="nutrition" />
      <Tabs.Screen name="trainer" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
