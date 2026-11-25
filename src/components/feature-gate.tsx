import type { ComponentType } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useProgression, useSettings } from "@/api/settings";
import type { FeatureKey } from "@/api/types";
import { colors } from "@/theme/tokens";
import { Button } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/extra";
import { Screen } from "@/components/ui/screen";
import { RecessedSurface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";

const REQUIREMENT: Partial<Record<FeatureKey, string>> = {
  body_map: "Finish your first workout to unlock the muscle map.",
  progress_basic: "Finish your first workout to start tracking progress.",
  goals: "Finish 2 workouts (or train 3 days) to start setting goals.",
  programs: "Finish 3 workouts to build multi-week programs.",
  progress_advanced: "Finish 5 workouts to see strength curves and records.",
  achievements: "Earn your first PR or badge to open achievements.",
  store: "Finish your first workout to open the store.",
  insights: "Finish 4 workouts and Kai starts sending proactive insights.",
  voice_chat: "Send 10 messages to Kai to turn on voice mode.",
};

export function LockedScreen({ feature }: { feature: FeatureKey }) {
  const router = useRouter();
  const { setGating } = useSettings();
  return (
    <Screen>
      <PageHeader title="" />
      <RecessedSurface radiusSize="large" style={{ padding: 28, alignItems: "center", gap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} />
        </View>
        <Text variant="heading">Not unlocked yet</Text>
        <Text color="secondary" style={{ textAlign: "center" }}>{REQUIREMENT[feature] ?? "Keep training — this unlocks as you go."}</Text>
        <View style={{ alignSelf: "stretch", gap: 10, marginTop: 8 }}>
          <Button label="Back to home" onPress={() => router.replace("/dashboard")} />
          <Button label="Show me everything instead" variant="ghost" onPress={() => setGating(false)} />
        </View>
      </RecessedSurface>
    </Screen>
  );
}

/** Wrap a route component so it renders <LockedScreen> until `feature` is unlocked. */
export function gated<P extends object>(feature: FeatureKey, Component: ComponentType<P>) {
  return function Gated(props: P) {
    const { has } = useProgression();
    return has(feature) ? <Component {...props} /> : <LockedScreen feature={feature} />;
  };
}
