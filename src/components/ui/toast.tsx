/**
 * Global toasts — the mobile counterpart of the website's CoinToast and the
 * small "saved" pills. Call `toast.success("Saved")`, `toast.coins(40, "Workout
 * complete")` or `toast.error("Couldn't save")` from anywhere; <ToastHost/> in
 * the root layout renders them stacked at the top, clear of bars and the keyboard. Each self-dismisses.
 */
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, radius, shadow } from "@/theme/tokens";
import { motion } from "@/lib/motion";
import { Text } from "./text";

type Kind = "success" | "coin" | "error" | "info";
type ToastItem = { id: number; kind: Kind; text: string; amount?: number; action?: { label: string; onPress: () => void } };

const listeners = new Set<(t: ToastItem) => void>();
let seq = 0;

function emit(t: Omit<ToastItem, "id">) {
  const item = { ...t, id: ++seq };
  listeners.forEach((l) => l(item));
}

export const toast = {
  success: (text: string, action?: ToastItem["action"]) => emit({ kind: "success", text, action }),
  info: (text: string, action?: ToastItem["action"]) => emit({ kind: "info", text, action }),
  error: (text: string) => emit({ kind: "error", text }),
  coins: (amount: number, text: string) => emit({ kind: "coin", amount, text }),
};

const DURATION = 2800;

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const on = (t: ToastItem) => {
      if (t.kind === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      else if (t.kind === "coin") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setItems((cur) => [...cur, t].slice(-3));
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), t.action ? DURATION + 2000 : DURATION);
    };
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, top: insets.top + 8, alignItems: "center", gap: 8 }}>
      {items.map((t) => (
        <ToastPill key={t.id} item={t} onDismiss={() => setItems((cur) => cur.filter((x) => x.id !== t.id))} />
      ))}
    </View>
  );
}

function ToastPill({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (motion.reduced) a.setValue(1);
    else Animated.spring(a, { toValue: 1, useNativeDriver: true, stiffness: 380, damping: 26, mass: 1 }).start();
  }, [a]);
  const tint = item.kind === "coin" ? colors.amber : item.kind === "error" ? colors.danger : item.kind === "info" ? colors.cyan : colors.lime;
  const icon = item.kind === "coin" ? "logo-bitcoin" : item.kind === "error" ? "alert-circle" : item.kind === "info" ? "information-circle" : "checkmark-circle";
  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        {
          opacity: a,
          transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingLeft: 12,
          paddingRight: 16,
          minHeight: 44,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceOpaque,
          borderWidth: 1,
          borderColor: item.kind === "coin" ? "rgba(255,182,97,0.35)" : colors.lineSoft,
          maxWidth: "100%",
        },
        shadow.float,
      ]}
    >
      <Pressable onPress={onDismiss} style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
        <Ionicons name={icon} size={18} color={tint} />
        {item.kind === "coin" ? <Text style={{ fontFamily: fonts.numBold, color: tint, fontSize: 15 }}>+{item.amount}</Text> : null}
        <Text numberOfLines={2} style={{ fontSize: 14, flexShrink: 1 }}>{item.text}</Text>
      </Pressable>
      {item.action ? (
        <Pressable
          onPress={() => {
            item.action?.onPress();
            onDismiss();
          }}
          hitSlop={10}
        >
          <Text style={{ color: colors.pinkSoft, fontFamily: fonts.semibold, fontSize: 14 }}>{item.action.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}
