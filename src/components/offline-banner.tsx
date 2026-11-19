import { useEffect, useRef, useState } from "react";
import { Animated, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { network } from "@/api/client";
import { colors, fonts, radius } from "@/theme/tokens";
import { Text } from "./ui/text";

/** Slides down from the top when the API can't be reached; tap to retry. */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(network.isOnline());
  const [checking, setChecking] = useState(false);
  const a = useRef(new Animated.Value(online ? 0 : 1)).current;
  useEffect(() => network.subscribe(setOnline), []);
  useEffect(() => {
    Animated.spring(a, { toValue: online ? 0 : 1, useNativeDriver: true, stiffness: 260, damping: 26 }).start();
  }, [online, a]);
  return (
    <Animated.View
      pointerEvents={online ? "none" : "auto"}
      style={{ position: "absolute", top: insets.top + 6, left: 16, right: 16, alignItems: "center", opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }] }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Offline. Tap to retry"
        onPress={async () => {
          setChecking(true);
          await network.check();
          setChecking(false);
        }}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceOpaque, borderWidth: 1, borderColor: "rgba(255,156,99,0.4)" }}
      >
        <Ionicons name="cloud-offline-outline" size={16} color={colors.orange} />
        <Text style={{ fontSize: 13, fontFamily: fonts.semibold }}>{checking ? "Reconnecting…" : "You're offline · tap to retry"}</Text>
      </Pressable>
    </Animated.View>
  );
}
