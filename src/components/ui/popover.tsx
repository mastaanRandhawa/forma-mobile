/**
 * PopoverMenu — a compact dropdown anchored to its trigger. It grows out of the
 * trigger's corner (scale + fade, 160ms ease-out) and closes on outside tap,
 * Escape / system back, or after choosing an item. For longer or form-like
 * content use `Sheet`; this is for short lists of destinations or actions.
 */
import { useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Dimensions, Modal, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius, shadow } from "@/theme/tokens";
import { EASE_LUXURY } from "@/lib/ease";
import { motion } from "@/lib/motion";
import { PressScale } from "./pressable";
import { Text } from "./text";

export type PopoverItem = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  hint?: string;
  badge?: string | number;
  destructive?: boolean;
  onPress: () => void;
};

export function PopoverMenu({
  trigger,
  items,
  accessibilityLabel,
  width = 248,
}: {
  trigger: (open: boolean) => ReactNode;
  items: PopoverItem[];
  accessibilityLabel: string;
  width?: number;
}) {
  useTheme();
  const ref = useRef<ComponentRef<typeof Pressable>>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const p = useSharedValue(0);
  const win = Dimensions.get("window");

  const show = () => {
    ref.current?.measureInWindow((x, y, w, h) => {
      setRect({ x, y, w, h });
      setOpen(true);
      p.set(0);
      p.set(withTiming(1, { duration: motion.reduced ? 0 : 170, easing: EASE_LUXURY }));
    });
  };
  const hide = (after?: () => void) => {
    p.set(withTiming(0, { duration: motion.reduced ? 0 : 120 }, (done) => {
      if (done) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        runClose();
      }
    }));
    if (after) setTimeout(after, motion.reduced ? 0 : 150);
  };
  const runClose = () => setOpen(false);

  const menu = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * -6 }, { scale: 0.94 + p.value * 0.06 }],
  }));

  // align the menu's right edge to the trigger, clamped inside the screen
  const left = Math.max(12, Math.min(win.width - width - 12, rect.x + rect.w - width));
  const top = rect.y + rect.h + 8;
  const originX = (rect.x + rect.w / 2 - left) / width;

  return (
    <>
      <Pressable ref={ref} onPress={show} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ expanded: open }} hitSlop={6}>
        {trigger(open)}
      </Pressable>
      <Modal visible={open} transparent animationType="none" onRequestClose={() => hide()}>
        <Pressable style={{ flex: 1 }} onPress={() => hide()} accessibilityLabel="Close menu" />
        <Animated.View
          accessibilityViewIsModal
          style={[{ position: "absolute", left, top, width, borderRadius: radius.medium, backgroundColor: colors.surfaceOpaque, padding: 6, transformOrigin: `${Math.round(originX * 100)}% 0%` }, shadow.float, menu]}
        >
          {items.map((it) => (
            <PressScale
              key={it.key}
              to={0.98}
              haptic={false}
              accessibilityLabel={it.label}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                hide(it.onPress);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46, paddingHorizontal: 12, borderRadius: radius.small }}
            >
              {it.icon ? <Ionicons name={it.icon} size={19} color={it.destructive ? colors.danger : colors.textSecondary} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: fonts.medium, color: it.destructive ? colors.danger : colors.textPrimary }}>{it.label}</Text>
                {it.hint ? <Text variant="meta" color="tertiary">{it.hint}</Text> : null}
              </View>
              {it.badge != null && it.badge !== 0 ? (
                <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.pink, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                  <Text style={{ color: colors.onAccent, fontSize: 11, fontFamily: fonts.semibold }}>{it.badge}</Text>
                </View>
              ) : null}
            </PressScale>
          ))}
        </Animated.View>
      </Modal>
    </>
  );
}
