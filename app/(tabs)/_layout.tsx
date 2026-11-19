import { View } from "react-native";
import { Tabs, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavChromeProvider } from "@/components/nav-chrome";
import { QuickActions } from "@/components/quick-actions";
import { DOCK_FULL, TabDock } from "@/components/tab-dock";
import { WorkoutInProgressBar } from "@/components/workout-bar";

/**
 * Four primary destinations — Home, Train, Nutrition, Coach. Everything else
 * (Progress, Body, Records, Goals, Library → Train menu; Notifications, Store,
 * Settings → account menu) hangs off these instead of competing for a tab.
 * `more` stays routable for old links but is hidden from the bar.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const onTrainer = segments.includes("trainer");
  const dockBottom = Math.max(insets.bottom, 12);
  return (
    <NavChromeProvider>
      <View style={{ flex: 1 }}>
        <Tabs tabBar={(p) => <TabDock {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" }, animation: "fade" }}>
          <Tabs.Screen name="dashboard" />
          <Tabs.Screen name="workouts" />
          <Tabs.Screen name="nutrition" />
          <Tabs.Screen name="trainer" />
          <Tabs.Screen name="more" options={{ href: null }} />
        </Tabs>
        {!onTrainer ? <WorkoutInProgressBar bottom={dockBottom + DOCK_FULL + 10} /> : null}
        <QuickActions bottom={dockBottom} />
      </View>
    </NavChromeProvider>
  );
}
