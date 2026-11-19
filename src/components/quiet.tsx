/**
 * Quiet — progressive disclosure for a dashboard widget (website:
 * components/Quiet.tsx). When "Interface details" is set to "When
 * interacting", the widget's numbers are veiled until tapped, then fade back
 * after a few seconds. "Always" renders straight through.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWidgetMode } from "@/api/settings";
import { colors, radius } from "@/theme/tokens";
import { Text } from "./ui/text";

const LINGER_MS = 5000;

export function Quiet({ widgetKey, children }: { widgetKey: string; children: ReactNode }) {
  const mode = useWidgetMode(widgetKey);
  const [shown, setShown] = useState(false);
  const veil = useRef(new Animated.Value(1)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    Animated.timing(veil, { toValue: shown ? 0 : 1, duration: 260, useNativeDriver: true }).start();
  }, [shown, veil]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  if (mode === "always") return <>{children}</>;
  const reveal = () => {
    setShown(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), LINGER_MS);
  };
  return (
    <View>
      {children}
      <Animated.View pointerEvents={shown ? "none" : "auto"} style={{ position: "absolute", inset: 0, opacity: veil, borderRadius: radius.large, overflow: "hidden" }}>
        <Pressable onPress={reveal} accessibilityRole="button" accessibilityLabel="Reveal details" style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background + "D9", gap: 6 }}>
          <Ionicons name="eye-outline" size={18} color={colors.textTertiary} />
          <Text variant="meta" color="tertiary">Tap to reveal</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
